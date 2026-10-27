const express = require('express');
const config = require('../config');
const auth = require('../services/auth');
const users = require('../db/users');
const { requireAuth } = require('../middleware/auth');
const { instanceId } = require('../db/store');

const router = express.Router();

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function readCredentials(body) {
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  return { username, password };
}

async function startSession(res, user) {
  const token = await auth.createSessionForUser(user.id);
  res.cookie(config.sessionCookieName, token, auth.sessionCookieOptions());
}

router.post('/signup', async (req, res) => {
  const { username, password } = readCredentials(req.body);

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters: a-z, 0-9 or _' });
  }
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  let user;
  try {
    user = await users.createUser(username, await auth.hashPassword(password));
  } catch (err) {
    if (err.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: 'Username is taken' });
    }
    throw err;
  }

  await startSession(res, user);
  res.status(201).json({ user, instanceId });
});

router.post('/login', async (req, res) => {
  const { username, password } = readCredentials(req.body);
  const found = username && password ? await users.findByUsername(username) : null;

  const valid = found
    ? await auth.verifyPassword(password, found.passwordHash)
    : await auth.fakePasswordCheck(password);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const user = { id: found.id, username: found.username };
  await startSession(res, user);
  res.json({ user, instanceId });
});

router.post('/logout', async (req, res) => {
  await auth.destroySession(req.headers.cookie);
  const { maxAge, ...options } = auth.sessionCookieOptions();
  res.clearCookie(config.sessionCookieName, options);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, instanceId });
});

module.exports = router;
