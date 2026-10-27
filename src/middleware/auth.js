const auth = require('../services/auth');

async function requireAuth(req, res, next) {
  const user = await auth.userFromCookieHeader(req.headers.cookie);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.user = user;
  next();
}

module.exports = { requireAuth };
