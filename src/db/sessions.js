const store = require('./store');

async function createSession(tokenHash, userId, expiresAt) {
  store.sessions.set(tokenHash, { userId, expiresAt });
}

async function findUserByTokenHash(tokenHash) {
  const session = store.sessions.get(tokenHash);
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    store.sessions.delete(tokenHash);
    return null;
  }
  const user = store.users.get(session.userId);
  return user ? { id: user.id, username: user.username } : null;
}

async function deleteSession(tokenHash) {
  store.sessions.delete(tokenHash);
}

module.exports = { createSession, findUserByTokenHash, deleteSession };
