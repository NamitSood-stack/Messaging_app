// In-memory data store. Everything here is lost when the server restarts.
// The modules in this folder keep the same async functions as the Postgres
// version (see later/postgres/db), so swapping back doesn't touch routes or sockets.
const crypto = require('node:crypto');

// Changes on every restart. Clients use it to throw away cached data whose
// ids belonged to an earlier run of the server.
const instanceId = crypto.randomUUID();

const counters = { users: 0, conversations: 0, messages: 0 };
const nextId = (table) => String(++counters[table]);

module.exports = {
  instanceId,
  nextId,
  users: new Map(),                  // id -> { id, username, passwordHash, createdAt }
  usersByName: new Map(),            // username -> user
  sessions: new Map(),               // tokenHash -> { userId, expiresAt }
  conversations: new Map(),          // id -> { id, userA, userB, createdAt, lastMessage }
  conversationByPair: new Map(),     // "userA:userB" -> conversation id
  conversationsByUser: new Map(),    // userId -> Set of conversation ids
  messagesByConversation: new Map(), // conversationId -> messages, oldest first
  messageByClientId: new Map()       // "senderId:clientMsgId" -> message
};
