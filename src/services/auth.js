const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { parseCookie } = require('cookie');
const config = require('../config');
const sessions = require('../db/sessions');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

// Stored as "scrypt$<salt>$<key>" so the algorithm can be upgraded later
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, saltB64, keyB64] = stored.split('$');
  if (algorithm !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

// Run when the username doesn't exist, so login takes the same time either way
async function fakePasswordCheck(password) {
  await scrypt(password, crypto.randomBytes(16), KEY_LENGTH);
  return false;
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function createSessionForUser(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await sessions.createSession(hashToken(token), userId, new Date(Date.now() + config.sessionTtlMs));
  return token;
}

function tokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  return parseCookie(cookieHeader)[config.sessionCookieName] || null;
}

async function userFromCookieHeader(cookieHeader) {
  const token = tokenFromCookieHeader(cookieHeader);
  return token ? sessions.findUserByTokenHash(hashToken(token)) : null;
}

async function destroySession(cookieHeader) {
  const token = tokenFromCookieHeader(cookieHeader);
  if (token) await sessions.deleteSession(hashToken(token));
}

const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  maxAge: config.sessionTtlMs,
  path: '/'
});

module.exports = {
  hashPassword,
  verifyPassword,
  fakePasswordCheck,
  createSessionForUser,
  userFromCookieHeader,
  destroySession,
  sessionCookieOptions
};
