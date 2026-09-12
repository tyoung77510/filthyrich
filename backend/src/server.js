'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db, ensureColumn } = require('./db');
const {
  hashPassword,
  verifyPassword,
  createSession,
  getUserFromToken,
  destroySession,
  tokenFromRequest,
} = require('./auth');

ensureColumn('users', 'role', "role TEXT NOT NULL DEFAULT 'player'");
ensureColumn('player_profiles', 'phone', 'phone TEXT');
ensureColumn('player_profiles', 'contact_email', 'contact_email TEXT');
ensureColumn('player_profiles', 'parent_phone', 'parent_phone TEXT');
ensureColumn('player_profiles', 'parent_email', 'parent_email TEXT');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VALID_VIDEO_TYPES = new Set(['highlight', 'game_film']);
const VALID_FUNDRAISER_STATUSES = new Set(['active', 'completed']);
const ALLOWED_VIDEO_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'www.vimeo.com',
  'hudl.com',
  'www.hudl.com',
];

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  return getUserFromToken(tokenFromRequest(req));
}

function requireAuth(req, res) {
  const user = currentUser(req);
  if (!user) {
    send(res, 401, { error: 'Sign in required' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    send(res, 403, { error: 'Admin access required' });
    return null;
  }
  return user;
}

function isValidVideoUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_VIDEO_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Deliberately loose — just enough to catch typos in a contact email, not a
// full RFC 5322 validator.
function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim());
}

// A fundraiser's donate link can point anywhere off-site (GoFundMe, Venmo,
// PayPal, a team store) — unlike video links there's no fixed host allowlist,
// just "must actually be a link" (https, so it can't be javascript:/data:/etc).
function isValidHttpsUrl(raw) {
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

// Full profile — includes email. Only for the signed-in owner looking at their
// own account (handleMe/handleUpdateProfile), never for viewing someone else.
function ownProfile(userRow) {
  const profile = db
    .prepare('SELECT * FROM player_profiles WHERE user_id = ?')
    .get(userRow.id);
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    profile: profile || null,
  };
}

// Columns safe to show on a public player page — deliberately an allowlist,
// not "everything except X", so a new sensitive column added to
// player_profiles later is private by default until someone explicitly
// decides it belongs here.
const PUBLIC_PROFILE_COLUMNS = 'user_id, position, grad_year, high_school, city, state, height, weight, bio';

// Public profile — no account email, no phone, no parent contact info.
// Anyone can look up a player by ID with no auth at all (recruiters browsing
// the roster don't have accounts), so this must never leak contact info for
// the player or, especially, for a minor's parent/guardian. Only the player
// themselves and admins see the full picture — see handleGetPlayer, which
// decides which of publicProfile()/ownProfile() to return.
function publicProfile(userRow) {
  const profile = db
    .prepare(`SELECT ${PUBLIC_PROFILE_COLUMNS} FROM player_profiles WHERE user_id = ?`)
    .get(userRow.id);
  return {
    id: userRow.id,
    name: userRow.name,
    role: userRow.role,
    profile: profile || null,
  };
}

// --- route handlers -------------------------------------------------------

async function handleSignup(req, res) {
  const body = await readBody(req);
  const { email, password, name } = body;
  if (!email || !password || !name) {
    return send(res, 400, { error: 'email, password, and name are required' });
  }
  if (String(password).length < 8) {
    return send(res, 400, { error: 'Password must be at least 8 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return send(res, 409, { error: 'An account with that email already exists' });

  // Bootstrap: the very first account created on a fresh install becomes admin,
  // so there's a way in without touching the database by hand. Every signup
  // after that is a regular player.
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  const role = count === 0 ? 'admin' : 'player';

  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(email, hash, salt, name, role);
  db.prepare('INSERT INTO player_profiles (user_id) VALUES (?)').run(info.lastInsertRowid);

  const token = createSession(info.lastInsertRowid);
  send(res, 201, { token, user: { id: info.lastInsertRowid, email, name, role } });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const { email, password } = body;
  if (!email || !password) return send(res, 400, { error: 'email and password are required' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !verifyPassword(password, row.salt, row.password_hash)) {
    return send(res, 401, { error: 'Invalid email or password' });
  }
  const token = createSession(row.id);
  send(res, 200, {
    token,
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
  });
}

function handleLogout(req, res) {
  const token = tokenFromRequest(req);
  if (token) destroySession(token);
  send(res, 200, { ok: true });
}

function handleMe(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  send(res, 200, ownProfile(user));
}

async function handleUpdateProfile(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const body = await readBody(req);
  const fields = [
    'position', 'grad_year', 'high_school', 'city', 'state', 'height', 'weight', 'bio',
    'phone', 'contact_email', 'parent_phone', 'parent_email',
  ];
  const updates = fields.filter((f) => f in body);
  if (updates.length === 0) return send(res, 400, { error: 'No recognized fields provided' });

  for (const f of ['contact_email', 'parent_email']) {
    const value = body[f];
    if (value && !isValidEmail(value)) {
      return send(res, 400, { error: `${f.replace('_', ' ')} doesn't look like a valid email` });
    }
  }

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => body[f]);
  db.prepare(`UPDATE player_profiles SET ${setClause} WHERE user_id = ?`).run(...values, user.id);
  send(res, 200, ownProfile(user));
}

function handleGetPlayer(req, res, id) {
  const row = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(id);
  if (!row) return send(res, 404, { error: 'Player not found' });
  // Contact info (phone, contact email, parent phone/email) and the account
  // email are only included for the player's own account or an admin/coach
  // who has a real reason to reach them or their parent — anonymous and
  // other-player requests get the public, contact-free view.
  const requester = currentUser(req);
  const canSeeContact = requester && (requester.id === row.id || requester.role === 'admin');
  send(res, 200, canSeeContact ? ownProfile(row) : publicProfile(row));
}

// Public roster directory — no auth required, so coaches/recruiters can browse
// without an account. Deliberately omits email (only the signed-in owner or an
// admin sees that, via /api/players/me or /api/auth/me).
function handleListPlayers(req, res, query) {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, p.position, p.grad_year, p.high_school, p.city, p.state,
              (SELECT COUNT(*) FROM videos v WHERE v.user_id = u.id) AS video_count
       FROM users u
       LEFT JOIN player_profiles p ON p.user_id = u.id
       WHERE u.role = 'player'
       ORDER BY u.name ASC`
    )
    .all();

  const search = (query.get('q') || '').trim().toLowerCase();
  const filtered = search
    ? rows.filter((r) =>
        [r.name, r.position, r.high_school, r.city, r.state]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(search))
      )
    : rows;

  send(res, 200, filtered);
}

function handleListTournaments(req, res) {
  const rows = db
    .prepare('SELECT * FROM tournaments ORDER BY start_date ASC')
    .all();
  send(res, 200, rows);
}

function handleGetTournament(req, res, id) {
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  if (!row) return send(res, 404, { error: 'Tournament not found' });
  const roster = db
    .prepare(
      `SELECT u.id, u.name, r.status, r.created_at
       FROM registrations r JOIN users u ON u.id = r.user_id
       WHERE r.tournament_id = ? AND r.status != 'cancelled'
       ORDER BY r.created_at ASC`
    )
    .all(id);
  send(res, 200, { ...row, roster });
}

async function handleCreateTournament(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const body = await readBody(req);
  const { name, location, start_date, end_date, registration_deadline, description } = body;
  if (!name || !start_date) return send(res, 400, { error: 'name and start_date are required' });

  const info = db
    .prepare(
      `INSERT INTO tournaments (name, location, start_date, end_date, registration_deadline, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, location || null, start_date, end_date || null, registration_deadline || null, description || null);
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(info.lastInsertRowid);
  send(res, 201, row);
}

async function handlePatchTournament(req, res, id) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  if (!existing) return send(res, 404, { error: 'Tournament not found' });

  const body = await readBody(req);
  const fields = ['name', 'location', 'start_date', 'end_date', 'registration_deadline', 'description'];
  const updates = fields.filter((f) => f in body);
  if (updates.length === 0) return send(res, 400, { error: 'No recognized fields provided' });

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => body[f]);
  db.prepare(`UPDATE tournaments SET ${setClause} WHERE id = ?`).run(...values, id);
  send(res, 200, db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id));
}

function handleDeleteTournament(req, res, id) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const existing = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(id);
  if (!existing) return send(res, 404, { error: 'Tournament not found' });
  db.prepare('DELETE FROM registrations WHERE tournament_id = ?').run(id);
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
  send(res, 200, { ok: true });
}

function handleRegister(req, res, tournamentId) {
  const user = requireAuth(req, res);
  if (!user) return;
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) return send(res, 404, { error: 'Tournament not found' });

  const existing = db
    .prepare('SELECT * FROM registrations WHERE tournament_id = ? AND user_id = ?')
    .get(tournamentId, user.id);
  if (existing && existing.status !== 'cancelled') {
    return send(res, 409, { error: 'Already registered for this tournament' });
  }
  if (existing) {
    db.prepare("UPDATE registrations SET status = 'registered' WHERE id = ?").run(existing.id);
  } else {
    db.prepare('INSERT INTO registrations (tournament_id, user_id) VALUES (?, ?)').run(
      tournamentId,
      user.id
    );
  }
  send(res, 201, { ok: true, tournament_id: Number(tournamentId), user_id: user.id });
}

function handleCancelRegistration(req, res, tournamentId) {
  const user = requireAuth(req, res);
  if (!user) return;
  const existing = db
    .prepare('SELECT * FROM registrations WHERE tournament_id = ? AND user_id = ?')
    .get(tournamentId, user.id);
  if (!existing) return send(res, 404, { error: 'Not registered for this tournament' });
  db.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").run(existing.id);
  send(res, 200, { ok: true });
}

// --- fundraising ------------------------------------------------------------

function handleListFundraisers(req, res) {
  const rows = db
    .prepare(
      `SELECT * FROM fundraisers
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC`
    )
    .all();
  send(res, 200, rows);
}

function handleGetFundraiser(req, res, id) {
  const row = db.prepare('SELECT * FROM fundraisers WHERE id = ?').get(id);
  if (!row) return send(res, 404, { error: 'Fundraiser not found' });
  send(res, 200, row);
}

async function handleCreateFundraiser(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const body = await readBody(req);
  const { title, description, goal_amount, link } = body;
  if (!title) return send(res, 400, { error: 'title is required' });
  if (goal_amount != null && goal_amount !== '' && !(Number(goal_amount) >= 0)) {
    return send(res, 400, { error: 'goal_amount must be a non-negative number' });
  }
  if (link && !isValidHttpsUrl(link)) {
    return send(res, 400, { error: 'link must be a valid https:// URL' });
  }

  const info = db
    .prepare(
      `INSERT INTO fundraisers (title, description, goal_amount, link)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      title,
      description || null,
      goal_amount != null && goal_amount !== '' ? Number(goal_amount) : null,
      link || null
    );
  send(res, 201, db.prepare('SELECT * FROM fundraisers WHERE id = ?').get(info.lastInsertRowid));
}

async function handlePatchFundraiser(req, res, id) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const existing = db.prepare('SELECT * FROM fundraisers WHERE id = ?').get(id);
  if (!existing) return send(res, 404, { error: 'Fundraiser not found' });

  const body = await readBody(req);
  const fields = ['title', 'description', 'goal_amount', 'raised_amount', 'link', 'status'];
  const updates = fields.filter((f) => f in body);
  if (updates.length === 0) return send(res, 400, { error: 'No recognized fields provided' });

  for (const f of ['goal_amount', 'raised_amount']) {
    if (f in body && body[f] !== null && body[f] !== '' && !(Number(body[f]) >= 0)) {
      return send(res, 400, { error: `${f.replace('_', ' ')} must be a non-negative number` });
    }
  }
  if ('link' in body && body.link && !isValidHttpsUrl(body.link)) {
    return send(res, 400, { error: 'link must be a valid https:// URL' });
  }
  if ('status' in body && !VALID_FUNDRAISER_STATUSES.has(body.status)) {
    return send(res, 400, { error: "status must be 'active' or 'completed'" });
  }

  const values = updates.map((f) => {
    if (f === 'goal_amount' || f === 'raised_amount') {
      return body[f] === '' || body[f] == null ? null : Number(body[f]);
    }
    return body[f] === '' ? null : body[f];
  });
  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE fundraisers SET ${setClause} WHERE id = ?`).run(...values, id);
  send(res, 200, db.prepare('SELECT * FROM fundraisers WHERE id = ?').get(id));
}

function handleDeleteFundraiser(req, res, id) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const existing = db.prepare('SELECT id FROM fundraisers WHERE id = ?').get(id);
  if (!existing) return send(res, 404, { error: 'Fundraiser not found' });
  db.prepare('DELETE FROM fundraisers WHERE id = ?').run(id);
  send(res, 200, { ok: true });
}

async function handleCreateVideo(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  const body = await readBody(req);
  const { title, type, url } = body;
  if (!title || !url) return send(res, 400, { error: 'title and url are required' });
  const videoType = VALID_VIDEO_TYPES.has(type) ? type : 'highlight';
  if (!isValidVideoUrl(url)) {
    return send(res, 400, {
      error: 'url must be an https link to YouTube, Vimeo, or Hudl',
    });
  }
  const info = db
    .prepare('INSERT INTO videos (user_id, title, type, url) VALUES (?, ?, ?, ?)')
    .run(user.id, title, videoType, url);
  send(res, 201, db.prepare('SELECT * FROM videos WHERE id = ?').get(info.lastInsertRowid));
}

function handleListPlayerVideos(req, res, playerId) {
  const rows = db
    .prepare('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC')
    .all(playerId);
  send(res, 200, rows);
}

function handleDeleteVideo(req, res, id) {
  const user = requireAuth(req, res);
  if (!user) return;
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
  if (!video) return send(res, 404, { error: 'Video not found' });
  if (video.user_id !== user.id && user.role !== 'admin') {
    return send(res, 403, { error: 'You can only delete your own videos' });
  }
  db.prepare('DELETE FROM videos WHERE id = ?').run(id);
  send(res, 200, { ok: true });
}

// --- static file serving ---------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
        if (err2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(indexContent);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// --- router ------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (parts[0] === 'api') {
      if (parts[1] === 'auth' && parts[2] === 'signup' && req.method === 'POST') return await handleSignup(req, res);
      if (parts[1] === 'auth' && parts[2] === 'login' && req.method === 'POST') return await handleLogin(req, res);
      if (parts[1] === 'auth' && parts[2] === 'logout' && req.method === 'POST') return handleLogout(req, res);
      if (parts[1] === 'auth' && parts[2] === 'me' && req.method === 'GET') return handleMe(req, res);

      if (parts[1] === 'players' && parts[2] === 'me' && req.method === 'PATCH') return await handleUpdateProfile(req, res);
      if (parts[1] === 'players' && parts.length === 2 && req.method === 'GET') return handleListPlayers(req, res, url.searchParams);
      if (parts[1] === 'players' && parts[3] === 'videos' && req.method === 'GET') return handleListPlayerVideos(req, res, parts[2]);
      if (parts[1] === 'players' && parts.length === 3 && req.method === 'GET') return handleGetPlayer(req, res, parts[2]);

      if (parts[1] === 'tournaments' && parts.length === 2 && req.method === 'GET') return handleListTournaments(req, res);
      if (parts[1] === 'tournaments' && parts.length === 2 && req.method === 'POST') return await handleCreateTournament(req, res);
      if (parts[1] === 'tournaments' && parts.length === 3 && req.method === 'GET') return handleGetTournament(req, res, parts[2]);
      if (parts[1] === 'tournaments' && parts.length === 3 && req.method === 'PATCH') return await handlePatchTournament(req, res, parts[2]);
      if (parts[1] === 'tournaments' && parts.length === 3 && req.method === 'DELETE') return handleDeleteTournament(req, res, parts[2]);
      if (parts[1] === 'tournaments' && parts[3] === 'register' && req.method === 'POST') return handleRegister(req, res, parts[2]);
      if (parts[1] === 'tournaments' && parts[3] === 'register' && req.method === 'DELETE') return handleCancelRegistration(req, res, parts[2]);

      if (parts[1] === 'videos' && parts.length === 2 && req.method === 'POST') return await handleCreateVideo(req, res);
      if (parts[1] === 'videos' && parts.length === 3 && req.method === 'DELETE') return handleDeleteVideo(req, res, parts[2]);

      if (parts[1] === 'fundraisers' && parts.length === 2 && req.method === 'GET') return handleListFundraisers(req, res);
      if (parts[1] === 'fundraisers' && parts.length === 2 && req.method === 'POST') return await handleCreateFundraiser(req, res);
      if (parts[1] === 'fundraisers' && parts.length === 3 && req.method === 'GET') return handleGetFundraiser(req, res, parts[2]);
      if (parts[1] === 'fundraisers' && parts.length === 3 && req.method === 'PATCH') return await handlePatchFundraiser(req, res, parts[2]);
      if (parts[1] === 'fundraisers' && parts.length === 3 && req.method === 'DELETE') return handleDeleteFundraiser(req, res, parts[2]);

      return send(res, 404, { error: 'Not found' });
    }

    return serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.message === 'Invalid JSON' || err.message === 'Payload too large' ? 400 : 500;
    send(res, status, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Filthy Rich 7v7 Football Club API + frontend at http://localhost:${PORT}`);
});

module.exports = server;
