const auth = require('../services/auth');
const conversations = require('../db/conversations');
const messages = require('../db/messages');
const { isId, isUuid } = require('../utils/validate');

const userRoom = (userId) => `user:${userId}`;

function initSockets(io) {
  io.use(async (socket, next) => {
    try {
      const user = await auth.userFromCookieHeader(socket.handshake.headers.cookie);
      if (!user) return next(new Error('Unauthorized'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(userRoom(user.id));

    socket.on('message:send', async (payload, ack) => {
      if (typeof ack !== 'function') return;

      const { conversationId, clientMsgId } = payload || {};
      const body = typeof payload?.body === 'string' ? payload.body.trim() : '';

      if (!isId(conversationId) || !isUuid(clientMsgId) || !body || body.length > 2000) {
        return ack({ error: 'Invalid message' });
      }

      try {
        const members = await conversations.getMembers(conversationId, user.id);
        if (!members) return ack({ error: 'Conversation not found' });

        const { message, created } = await messages.insertMessage({
          conversationId,
          senderId: user.id,
          clientMsgId,
          body
        });

        if (created) {
          io.to(members.map(userRoom)).emit('message:new', message);
        }
        ack({ message });
      } catch (err) {
        console.error('message:send failed:', err);
        ack({ error: 'Could not send message' });
      }
    });
  });
}

module.exports = { initSockets };
