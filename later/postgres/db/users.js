const { query } = require('./pool');

// pg returns BIGINT as a string; ids stay strings everywhere in the app
const toUser = (row) => ({ id: row.id, username: row.username });

async function createUser(username, passwordHash) {
  const { rows } = await query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, passwordHash]
  );
  return toUser(rows[0]);
}

async function findByUsername(username) {
  const { rows } = await query(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username]
  );
  return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
}

async function searchUsers(prefix, excludeUserId, limit = 20) {
  const escaped = prefix.replace(/[\\%_]/g, '\\$&');
  const { rows } = await query(
    `SELECT id, username FROM users
     WHERE username LIKE $1 ESCAPE '\\' AND id <> $2
     ORDER BY username
     LIMIT $3`,
    [`${escaped}%`, excludeUserId, limit]
  );
  return rows.map(toUser);
}

module.exports = { createUser, findByUsername, searchUsers };
