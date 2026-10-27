const express = require('express');
const users = require('../db/users');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  if (!search || search.length > 20) {
    return res.json({ users: [] });
  }
  res.json({ users: await users.searchUsers(search, req.user.id) });
});

module.exports = router;
