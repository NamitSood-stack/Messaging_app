const express = require('express');
const users = require('../db/users');
const conversations = require('../db/conversations');
const messages = require('../db/messages');
const { requireAuth } = require('../middleware/auth');
const { isId } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json({ conversations: await conversations.listForUser(req.user.id) });
});

// Opens the 1:1 chat with `username`, creating it the first time
router.post('/', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const other = username ? await users.findByUsername(username) : null;

  if (!other) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (other.id === req.user.id) {
    return res.status(400).json({ error: "You can't start a chat with yourself" });
  }

  const id = await conversations.findOrCreate(req.user.id, other.id);
  res.json({ conversation: await conversations.getSummary(id, req.user.id) });
});

router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const before = req.query.before;

  if (!isId(id) || (before !== undefined && !isId(before))) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (!(await conversations.getMembers(id, req.user.id))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  res.json(await messages.listPage(id, before ?? null, limit));
});

module.exports = router;
