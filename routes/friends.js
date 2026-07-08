const express = require('express');
const { queryAll, queryOne, run } = require('../db/init');
const { authMiddleware } = require('./auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const friends = queryAll(`
    SELECT u.id, u.username, u.avatar_color, u.rating, u.last_seen
    FROM friends f
    JOIN users u ON (
      CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
    ) = u.id
    WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
  `, [req.user.id, req.user.id, req.user.id]);

  const received = queryAll(`
    SELECT u.id, u.username, u.avatar_color, u.rating
    FROM friends f
    JOIN users u ON f.user_id = u.id
    WHERE f.friend_id = ? AND f.status = 'pending'
  `, [req.user.id]);

  const sent = queryAll(`
    SELECT u.id, u.username, u.avatar_color, u.rating
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = 'pending'
  `, [req.user.id]);

  res.json({ friends, received, sent });
});

router.post('/request', authMiddleware, (req, res) => {
  const { username } = req.body;
  const target = queryOne('SELECT id, username FROM users WHERE username = ?', [username]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "Can't add yourself" });

  const existing = queryOne(`
    SELECT * FROM friends
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `, [req.user.id, target.id, target.id, req.user.id]);

  if (existing) {
    if (existing.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
    if (existing.status === 'pending') return res.status(400).json({ error: 'Request already sent' });
  }

  run('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
    [req.user.id, target.id, 'pending']);
  res.json({ ok: true });
});

router.post('/accept', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const friendship = queryOne(
    'SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?',
    [userId, req.user.id, 'pending']
  );
  if (!friendship) return res.status(404).json({ error: 'Request not found' });

  run('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?',
    ['accepted', userId, req.user.id]);
  res.json({ ok: true });
});

router.post('/reject', authMiddleware, (req, res) => {
  const { userId } = req.body;
  run('DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?',
    [userId, req.user.id, 'pending']);
  res.json({ ok: true });
});

router.delete('/:userId', authMiddleware, (req, res) => {
  const { userId } = req.params;
  run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    [req.user.id, userId, userId, req.user.id]);
  res.json({ ok: true });
});

router.get('/search', authMiddleware, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json({ users: [] });

  const users = queryAll(`
    SELECT id, username, avatar_color, rating
    FROM users WHERE username LIKE ? AND id != ? LIMIT 20
  `, [`%${q}%`, req.user.id]);

  const myId = req.user.id;
  const friendships = queryAll(`
    SELECT friend_id as uid, status FROM friends WHERE user_id = ?
    UNION ALL
    SELECT user_id as uid, status FROM friends WHERE friend_id = ?
  `, [myId, myId]);

  const relMap = {};
  friendships.forEach(f => { relMap[f.uid] = f.status; });

  const enriched = users.map(u => ({
    ...u,
    friendship: relMap[u.id] || null
  }));

  res.json({ users: enriched });
});

module.exports = router;
