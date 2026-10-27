const store = require('./store');

// Idempotent on (senderId, clientMsgId): a retry returns the original message
// with created=false instead of storing a second copy.
async function insertMessage({ conversationId, senderId, clientMsgId, body }) {
  const clientKey = `${senderId}:${clientMsgId}`;
  const existing = store.messageByClientId.get(clientKey);

  if (existing) {
    if (existing.conversationId !== conversationId) {
      throw new Error('clientMsgId reused across conversations');
    }
    return { message: existing, created: false };
  }

  const message = {
    id: store.nextId('messages'),
    conversationId,
    senderId,
    clientMsgId,
    body,
    createdAt: new Date().toISOString()
  };
  store.messagesByConversation.get(conversationId).push(message);
  store.messageByClientId.set(clientKey, message);
  store.conversations.get(conversationId).lastMessage = message;
  return { message, created: true };
}

// Cursor pagination: newest `limit` messages older than beforeId, returned oldest-first
async function listPage(conversationId, beforeId, limit) {
  const all = store.messagesByConversation.get(conversationId) || [];
  let end = all.length;
  if (beforeId) {
    const index = all.findIndex((m) => Number(m.id) >= Number(beforeId));
    if (index >= 0) end = index;
  }
  const start = Math.max(0, end - limit);
  return { messages: all.slice(start, end), hasMore: start > 0 };
}

module.exports = { insertMessage, listPage };
