const store = require('./store');

const toUser = (user) => ({ id: user.id, username: user.username });

async function createUser(username, passwordHash) {
  if (store.usersByName.has(username)) {
    const err = new Error('Username is taken');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }
  const user = { id: store.nextId('users'), username, passwordHash, createdAt: new Date().toISOString() };
  store.users.set(user.id, user);
  store.usersByName.set(username, user);
  return toUser(user);
}

async function findByUsername(username) {
  const user = store.usersByName.get(username);
  return user ? { ...toUser(user), passwordHash: user.passwordHash } : null;
}

async function searchUsers(prefix, excludeUserId, limit = 20) {
  return [...store.usersByName.values()]
    .filter((user) => user.id !== excludeUserId && user.username.startsWith(prefix))
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, limit)
    .map(toUser);
}

module.exports = { createUser, findByUsername, searchUsers };
