const { query } = require('./pool');

// Rows are stored with user_a < user_b so each pair has exactly one conversation
function orderPair(x, y) {
  return BigInt(x) < BigInt(y) ? [x, y] : [y, x];
}

async function findOrCreate(userId, otherUserId) {
  const [a, b] = orderPair(userId, otherUserId);
  const { rows } = await query(
    `WITH ins AS (
       INSERT INTO conversations (user_a, user_b) VALUES ($1, $2)
       ON CONFLICT (user_a, user_b) DO NOTHING
       RETURNING id
     )
     SELECT id FROM ins
     UNION ALL
     SELECT id FROM conversations WHERE user_a = $1 AND user_b = $2
     LIMIT 1`,
    [a, b]
  );
  return rows[0].id;
}

// Returns both member ids if userId belongs to the conversation, else null
async function getMembers(conversationId, userId) {
  const { rows } = await query(
    'SELECT user_a, user_b FROM conversations WHERE id = $1 AND $2 IN (user_a, user_b)',
    [conversationId, userId]
  );
  return rows[0] ? [rows[0].user_a, rows[0].user_b] : null;
}

const SUMMARY_SQL = `
  SELECT c.id, c.last_message_at,
         u.id AS other_id, u.username AS other_username,
         m.id AS last_id, m.body AS last_body, m.sender_id AS last_sender_id,
         m.created_at AS last_created_at
  FROM conversations c
  JOIN users u ON u.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
  LEFT JOIN LATERAL (
    SELECT id, body, sender_id, created_at FROM messages
    WHERE conversation_id = c.id
    ORDER BY id DESC
    LIMIT 1
  ) m ON true
  WHERE (c.user_a = $1 OR c.user_b = $1)`;

function toSummary(row) {
  return {
    id: row.id,
    otherUser: { id: row.other_id, username: row.other_username },
    lastMessage: row.last_id
      ? { id: row.last_id, body: row.last_body, senderId: row.last_sender_id, createdAt: row.last_created_at }
      : null
  };
}

async function listForUser(userId) {
  const { rows } = await query(
    `${SUMMARY_SQL} ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC`,
    [userId]
  );
  return rows.map(toSummary);
}

async function getSummary(conversationId, userId) {
  const { rows } = await query(`${SUMMARY_SQL} AND c.id = $2`, [userId, conversationId]);
  return rows[0] ? toSummary(rows[0]) : null;
}

module.exports = { findOrCreate, getMembers, listForUser, getSummary };
