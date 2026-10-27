// LOCAL FICTIONAL-DATA DEMONSTRATION ONLY.
// Protects the existing Express pages and API routes with role-aware sessions.
// The standalone Python API on 127.0.0.1:8000 is NOT protected by this layer.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const session = require('express-session');
const oracledb = require('oracledb');

const scrypt = promisify(crypto.scrypt);
const HOME = {
  doctor: '/doctor-oracle-demo.html',
  lab: '/lab-demo.html',
  patient: '/patient-demo.html'
};
const PAGE_ROLES = new Map([
  ['/index.html', 'doctor'],
  ['/doctor-research-demo.html', 'doctor'],
  ['/doctor-oracle-demo.html', 'doctor'],
  ['/lab-demo.html', 'lab'],
  ['/patient-demo.html', 'patient']
]);
const loginFailures = new Map();

async function verifyPassword(password, saltHex, hashHex) {
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === 64 && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function reject(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function ownDemoRecord(user, id) {
  return user.role === 'patient' && user.patientId === String(id || '').toUpperCase();
}

module.exports = function installDemoAuth(app) {
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Set DEMO_SESSION_SECRET (32+ characters) in .env first.');
  }

  app.use(session({
    name: 'healthcare.demo.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // Local HTTP only. Production requires HTTPS and secure cookies.
      maxAge: 60 * 60 * 1000
    }
    // express-session MemoryStore is development-only, not a production session store.
  }));

  // Avoid cross-origin state-changing browser requests for this same-origin local demo.
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        try {
          if (new URL(origin).host !== req.get('host')) {
            return reject(res, 403, 'Request origin not allowed');
          }
        } catch {
          return reject(res, 403, 'Invalid request origin');
        }
      }
    }
    next();
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = req.body?.password;
    if (!/^[a-z0-9_]{3,50}$/.test(username) ||
        typeof password !== 'string' || !password || password.length > 256) {
      return reject(res, 400, 'Enter a valid username and password');
    }

    const ipKey = String(req.ip) + ':' + username;
    const now = Date.now();
    const failure = loginFailures.get(ipKey);
    if (failure?.until > now) return reject(res, 429, 'Too many attempts. Try later.');
    if (failure?.until && failure.until <= now) loginFailures.delete(ipKey);

    let connection;
    let user;
    try {
      connection = await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECT_STRING
      });
      const result = await connection.execute(
        `SELECT username AS "username", password_salt AS "salt",
                password_hash AS "hash", user_role AS "role",
                patient_id AS "patientId", active AS "active"
         FROM demo_user_account WHERE username = :username`,
        { username },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = result.rows[0];
      if (row && row.active === 1 && await verifyPassword(password, row.salt, row.hash)) {
        user = { username: row.username, role: row.role, patientId: row.patientId || null };
      }
    } catch (error) {
      console.error('[demo login]', error.message);
      return reject(res, 503, 'Login service unavailable. Check database setup.');
    } finally {
      if (connection) await connection.close().catch(() => {});
    }
    if (!user) {
      const old = loginFailures.get(ipKey);
      const attempts = (old?.until > now ? old.count : 0) + 1;
      loginFailures.set(ipKey, { count: attempts, until: now + 10 * 60 * 1000 });
      if (loginFailures.size > 1000) loginFailures.clear();
      return reject(res, attempts >= 5 ? 429 : 401, 'Invalid username or password');
    }
    loginFailures.delete(ipKey);
    req.session.regenerate(err => {
      if (err) return reject(res, 500, 'Could not start session');
      req.session.user = user;
      req.session.save(err2 => {
        if (err2) return reject(res, 500, 'Could not save session');
        res.json({ success: true, role: user.role,
          patientId: user.patientId, redirect: HOME[user.role] });
      });
    });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.session.user) return reject(res, 401, 'Not logged in');
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...req.session.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
      if (err) return reject(res, 500, 'Could not log out');
      res.clearCookie('healthcare.demo.sid');
      res.json({ success: true });
    });
  });

  // Patients should not learn other demo patients' names through the list API.
  app.get('/api/demo/patients', (req, res, next) => {
    const user = req.session.user;
    if (!user) return reject(res, 401, 'Login required');
    if (user.role === 'patient') {
      return res.json({ success: true, demoOnly: true,
        patients: [{ id: user.patientId, name: 'My fictional record' }] });
    }
    next();
  });

  // IMPORTANT: this middleware must run BEFORE existing API route registrations.
  app.use('/api', (req, res, next) => {
    const user = req.session.user;
    if (!user) return reject(res, 401, 'Login required');
    const path = req.path;
    const role = user.role;
    const method = req.method;

    if (path === '/demo/patients' && method === 'GET' &&
        (role === 'doctor' || role === 'lab')) return next();

    const patientMatch = /^\/demo\/patients\/([^/]+)$/i.exec(path);
    if (patientMatch && method === 'GET' &&
        (role === 'doctor' || ownDemoRecord(user, patientMatch[1]))) return next();

    if (path === '/demo/labs' && method === 'POST' && role === 'lab') return next();

    // Only doctors may use the educational ML and historical timeline proxy.
    if (path.startsWith('/research/') && role === 'doctor') return next();
    // Doctor-only, fictional Oracle / de-identified MIMIC timeline checker.
    if (role === 'doctor' && ((method === 'POST' && path === '/medication-history/check') ||
        (method === 'GET' && /^\/medication-history\/(?:oracle|mimic)\/[^/]+$/.test(path)))) return next();
    if (role === 'doctor' && (path === '/test-db' || path === '/medicines' ||
        /^\/patient\/[^/]+$/.test(path) || path === '/medicine/check')) return next();

    return reject(res, 403, 'Not permitted for this role');
  });

  // IMPORTANT: this middleware must run BEFORE express.static('public').
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/') {
      const role = req.session.user?.role;
      return res.redirect(role ? HOME[role] : '/login-demo.html');
    }
    const roleRequired = PAGE_ROLES.get(req.path.toLowerCase());
    if (!roleRequired) return next();
    const user = req.session.user;
    if (!user) return res.redirect('/login-demo.html');
    if (user.role !== roleRequired) return res.status(403).send('Not permitted for this role');
    next();
  });
};
