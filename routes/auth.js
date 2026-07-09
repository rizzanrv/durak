const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, queryAll, queryOne, run } = require('../db/init');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'durak-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d';

function generateToken() {
  return jwt.sign({ id: Date.now() }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    const session = queryOne('SELECT * FROM sessions WHERE token = ?', [token]);

    if (!session) {
      return res.status(401).json({ error: 'Сессия истекла' });
    }

    const user = queryOne('SELECT * FROM users WHERE id = ?', [session.user_id]);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Имя от 3 до 20 символов' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Только латиница, цифры и _' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }

    const existing = queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hash = await bcrypt.hash(password, 10);
    const colors = ['#6C5CE7', '#E17055', '#00B894', '#0984E3', '#E84393', '#FDCB6E', '#00CEC9', '#FF7675'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const result = run(
      'INSERT INTO users (username, email, password_hash, avatar_color) VALUES (?, ?, ?, ?)',
      [username, email, hash, avatarColor]
    );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      [token, result.lastInsertRowid, expiresAt]);

    res.json({
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        email,
        avatarColor,
        rating: 1000,
        gamesPlayed: 0,
        gamesWon: 0
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }

    const user = queryOne('SELECT * FROM users WHERE username = ? OR email = ?', [login, login]);

    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    run('UPDATE users SET last_seen = datetime("now") WHERE id = ?', [user.id]);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      [token, user.id, expiresAt]);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarColor: user.avatar_color,
        rating: user.rating,
        gamesPlayed: user.games_played,
        gamesWon: user.games_won
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  run('DELETE FROM sessions WHERE token = ?', [req.token]);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      avatarColor: req.user.avatar_color,
      avatarEmoji: req.user.avatar_emoji || '😎',
      bio: req.user.bio || '',
      rating: req.user.rating,
      gamesPlayed: req.user.games_played,
      gamesWon: req.user.games_won
    }
  });
});

router.put('/profile', authMiddleware, (req, res) => {
  const { avatar_emoji, bio, avatar_color } = req.body;
  if (avatar_emoji) run('UPDATE users SET avatar_emoji = ? WHERE id = ?', [avatar_emoji, req.user.id]);
  if (bio !== undefined) run('UPDATE users SET bio = ? WHERE id = ?', [bio, req.user.id]);
  if (avatar_color) run('UPDATE users SET avatar_color = ? WHERE id = ?', [avatar_color, req.user.id]);
  const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({
    user: {
      id: user.id, username: user.username, avatarColor: user.avatar_color,
      avatarEmoji: user.avatar_emoji || '😎', bio: user.bio || '',
      rating: user.rating, gamesPlayed: user.games_played, gamesWon: user.games_won
    }
  });
});

router.get('/profile/:userId', (req, res) => {
  const user = queryOne('SELECT id, username, avatar_color, avatar_emoji, bio, rating, games_played, games_won, created_at FROM users WHERE id = ?', [req.params.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user: {
      id: user.id, username: user.username, avatarColor: user.avatar_color,
      avatarEmoji: user.avatar_emoji || '😎', bio: user.bio || '',
      rating: user.rating, gamesPlayed: user.games_played, gamesWon: user.games_won,
      createdAt: user.created_at
    }
  });
});

module.exports = { router, authMiddleware };
