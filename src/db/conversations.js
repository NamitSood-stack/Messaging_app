const store = require('./store');

// Pairs are stored with the smaller id first so each pair has exactly one conversation
function orderPair(x, y) {
  return Number(x) < Number(y) ? [x, y] : [y, x];
}

function addToUserIndex(userId, conversationId) {
  if (!store.conversationsByUser.has(userId)) store.conversationsByUser.set(userId, new Set());
  store.conversationsByUser.get(userId).add(conversationId);
}

async function findOrCreate(userId, otherUserId) {
  const [userA, userB] = orderPair(userId, otherUserId);
  const pairKey = `${userA}:${userB}`;
  let id = store.conversationByPair.get(pairKey);

  if (!id) {
    id = store.nextId('conversations');
    store.conversations.set(id, { id, userA, userB, createdAt: new Date().toISOString(), lastMessage: null });
    store.conversationByPair.set(pairKey, id);
    store.messagesByConversation.set(id, []);
    addToUserIndex(userA, id);
    addToUserIndex(userB, id);
  }
  return id;
}

// Returns both member ids if userId belongs to the conversation, else null
async function getMembers(conversationId, userId) {
  const conv = store.conversations.get(conversationId);
  if (!conv || (conv.userA !== userId && conv.userB !== userId)) return null;
  return [conv.userA, conv.userB];
}

function toSummary(conv, userId) {
  const other = store.users.get(conv.userA === userId ? conv.userB : conv.userA);
  const last = conv.lastMessage;
  return {
    id: conv.id,
    otherUser: { id: other.id, username: other.username },
    lastMessage: last
      ? { id: last.id, body: last.body, senderId: last.senderId, createdAt: last.createdAt }
      : null
  };
}

async function listForUser(userId) {
  const ids = store.conversationsByUser.get(userId) || new Set();
  const lastId = (conv) => Number(conv.lastMessage?.id ?? 0);
  return [...ids]
    .map((id) => store.conversations.get(id))
    .sort((a, b) => lastId(b) - lastId(a) || Number(b.id) - Number(a.id))
    .map((conv) => toSummary(conv, userId));
}

async function getSummary(conversationId, userId) {
  if (!(await getMembers(conversationId, userId))) return null;
  return toSummary(store.conversations.get(conversationId), userId);
}

module.exports = { findOrCreate, getMembers, listForUser, getSummary };
