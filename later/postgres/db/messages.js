const { query, withTransaction } = require('./pool');

const COLUMNS = 'id, conversation_id, sender_id, client_msg_id, body, created_at';

const toMessage = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderId: row.sender_id,
  clientMsgId: row.client_msg_id,
  body: row.body,
  createdAt: row.created_at
});

// Idempotent on (senderId, clientMsgId): a retry returns the original message
// with created=false instead of inserting a second copy.
async function insertMessage({ conversationId, senderId, clientMsgId, body }) {
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, client_msg_id, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_id, client_msg_id) DO NOTHING
       RETURNING ${COLUMNS}`,
      [conversationId, senderId, clientMsgId, body]
    );

    if (inserted.rows[0]) {
      const message = toMessage(inserted.rows[0]);
      await client.query(
        'UPDATE conversations SET last_message_at = $2 WHERE id = $1',
        [conversationId, message.createdAt]
      );
      return { message, created: true };
    }

    const existing = await client.query(
      `SELECT ${COLUMNS} FROM messages WHERE sender_id = $1 AND client_msg_id = $2`,
      [senderId, clientMsgId]
    );
    const message = toMessage(existing.rows[0]);
    if (message.conversationId !== String(conversationId)) {
      throw new Error('clientMsgId reused across conversations');
    }
    return { message, created: false };
  });
}

// Cursor pagination: newest `limit` messages older than beforeId, returned oldest-first
async function listPage(conversationId, beforeId, limit) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM messages
     WHERE conversation_id = $1 AND ($2::bigint IS NULL OR id < $2)
     ORDER BY id DESC
     LIMIT $3`,
    [conversationId, beforeId, limit + 1]
  );
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMore };
}

module.exports = { insertMessage, listPage };
