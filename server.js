require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { initDb, queryAll, queryOne, run } = require('./db/init');
const { router: authRouter, authMiddleware } = require('./routes/auth');
const friendsRouter = require('./routes/friends');
const GameRoom = require('./game/Room');
const AIPlayer = require('./game/AI');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 60000 });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'durak-secret-key';

const rooms = new Map();
const userRooms = new Map();
const onlineUsers = new Map();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/friends', friendsRouter);

app.get('/api/rooms', (req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.state === 'waiting') list.push(room.getPublicState());
  }
  res.json({ rooms: list });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function authenticateSocket(token) {
  try {
    jwt.verify(token, JWT_SECRET);
    const session = queryOne('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return null;
    return queryOne('SELECT * FROM users WHERE id = ?', [session.user_id]);
  } catch { return null; }
}

function emitState(room, roomId) {
  io.to(roomId).emit('game_state', room.getState());
}

function getRoom(socket) {
  if (!socket.userId) return null;
  const roomId = userRooms.get(socket.userId);
  return roomId ? rooms.get(roomId) : null;
}

function getRoomId(socket) {
  return socket.userId ? userRooms.get(socket.userId) : null;
}

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('authenticate', (token) => {
    currentUser = authenticateSocket(token);
    if (currentUser) {
      onlineUsers.set(currentUser.id, {
        socketId: socket.id, username: currentUser.username,
        avatarColor: currentUser.avatar_color, rating: currentUser.rating
      });
      socket.userId = currentUser.id;
      socket.username = currentUser.username;
      io.emit('online_users', Array.from(onlineUsers.values()));
    }
  });

  socket.on('create_room', ({ mode }) => {
    if (!currentUser) return;
    const roomId = 'r_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const room = new GameRoom(roomId, mode || 'classic', currentUser.id);
    room.addPlayer(currentUser.id, currentUser.username);
    rooms.set(roomId, room);
    userRooms.set(currentUser.id, roomId);
    socket.join(roomId);
    socket.emit('room_created', room.getPublicState());
    io.emit('rooms_updated', getPublicRooms());
  });

  socket.on('join_room', ({ roomId }) => {
    if (!currentUser) return;
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.players.length >= room.maxPlayers) return socket.emit('error', { message: 'Room full' });
    if (room.state !== 'waiting') return socket.emit('error', { message: 'Game started' });
    room.addPlayer(currentUser.id, currentUser.username);
    userRooms.set(currentUser.id, roomId);
    socket.join(roomId);
    socket.emit('room_joined', room.getPublicState());
    io.to(roomId).emit('room_updated', room.getPublicState());
    io.emit('rooms_updated', getPublicRooms());
  });

  socket.on('player_ready', () => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room) return;
    room.setReady(currentUser.id);
    io.to(getRoomId(socket)).emit('room_updated', room.getPublicState());
    if (room.allReady()) startGame(room, getRoomId(socket));
  });

  socket.on('add_ai', () => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room) return;
    if (room.players.length >= room.maxPlayers) return;
    const aiId = 'ai_' + Date.now();
    room.addPlayer(aiId, 'Bot');
    room.setReady(aiId);
    io.to(getRoomId(socket)).emit('room_updated', room.getPublicState());
    io.emit('rooms_updated', getPublicRooms());
    if (room.allReady()) startGame(room, getRoomId(socket));
  });

  socket.on('start_game', () => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room || room.creatorId !== currentUser.id) return;
    if (room.players.length < room.minPlayers) return socket.emit('error', { message: 'Need 2+ players' });
    startGame(room, getRoomId(socket));
  });

  socket.on('attack', ({ card }) => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room) return;
    const result = room.attack(currentUser.id, card);
    if (result.error) return socket.emit('error', { message: result.error });
    if (result.gameOver) return handleGameOver(room, getRoomId(socket), result);
    emitState(room, getRoomId(socket));
    triggerAI(room, getRoomId(socket));
  });

  socket.on('defend', ({ attackCard, defenseCard }) => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room) return;
    const result = room.defend(currentUser.id, attackCard, defenseCard);
    if (result.error) return socket.emit('error', { message: result.error });
    if (result.gameOver) return handleGameOver(room, getRoomId(socket), result);
    emitState(room, getRoomId(socket));
    triggerAI(room, getRoomId(socket));
  });

  socket.on('take_cards', () => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room) return;
    const result = room.takeCards(currentUser.id);
    if (result.error) return socket.emit('error', { message: result.error });
    emitState(room, getRoomId(socket));
    triggerAI(room, getRoomId(socket));
  });

  socket.on('end_round', () => {
    if (!currentUser) return;
    const room = getRoom(socket);
    const rid = getRoomId(socket);
    if (!room) return;
    
    // Проверка что все атаки отбиты
    const attacks = room.table.filter(t => t.type === 'attack');
    const defenses = room.table.filter(t => t.type === 'defense');
    if (attacks.length !== defenses.length) {
      return socket.emit('error', { message: 'Not all attacks defended' });
    }
    
    if (currentUser.id !== room.players[room.attacker]?.id) return;
    const result = room.endRound();
    if (result.gameOver) return handleGameOver(room, rid, result);
    emitState(room, rid);
    triggerAI(room, rid);
  });

  socket.on('pass_attack', () => {
    if (!currentUser) return;
    const room = getRoom(socket);
    if (!room) return;
    const result = room.passAttack(currentUser.id);
    if (result.error) return socket.emit('error', { message: result.error });
    emitState(room, getRoomId(socket));
    triggerAI(room, getRoomId(socket));
  });

  socket.on('leave_room', () => {
    if (!socket.userId) return;
    const roomId = userRooms.get(socket.userId);
    const room = roomId ? rooms.get(roomId) : null;
    if (room) {
      room.removePlayer(socket.userId);
      socket.leave(roomId);
      if (room.players.length === 0) rooms.delete(roomId);
      else io.to(roomId).emit('room_updated', room.getPublicState());
    }
    userRooms.delete(socket.userId);
    io.emit('rooms_updated', getPublicRooms());
  });

  socket.on('invite_friend', ({ friendId }) => {
    if (!currentUser) return;
    const roomId = userRooms.get(currentUser.id);
    if (!roomId) return;
    const entry = Array.from(onlineUsers.entries()).find(([id, u]) => u.username === friendId);
    if (entry) {
      io.to(entry[1].socketId).emit('game_invite', { from: currentUser.username, roomId });
    }
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineUsers.delete(currentUser.id);
      io.emit('online_users', Array.from(onlineUsers.values()));
      const roomId = userRooms.get(currentUser.id);
      const room = roomId ? rooms.get(roomId) : null;
      if (room) {
        room.removePlayer(currentUser.id);
        socket.leave(roomId);
        if (room.players.length === 0) rooms.delete(roomId);
        else io.to(roomId).emit('room_updated', room.getPublicState());
      }
      userRooms.delete(currentUser.id);
      io.emit('rooms_updated', getPublicRooms());
    }
  });
});

function startGame(room, roomId) {
  const state = room.startGame();
  io.to(roomId).emit('game_started', state);
  io.emit('rooms_updated', getPublicRooms());
  triggerAI(room, roomId);
}

function triggerAI(room, roomId) {
  if (room.state !== 'playing') return;

  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];
  if (!attacker || !defender) return;

  const attackerIsAI = String(attacker.id).startsWith('ai_');
  const defenderIsAI = String(defender.id).startsWith('ai_');

  const aiPlayer = new AIPlayer(room);

  if (defenderIsAI && room.isDefenderTurn()) {
    setTimeout(() => {
      if (room.state !== 'playing') return;
      if (String(room.players[room.defender]?.id) !== String(defender.id)) return;

      const decision = aiPlayer.makeDecision(defender.id);
      if (!decision) return;

      if (decision.action === 'defend') {
        const res = room.defend(defender.id, decision.attackCard, decision.defenseCard);
        if (res.gameOver) return handleGameOver(room, roomId, res);
        emitState(room, roomId);
        triggerAI(room, roomId);
      } else if (decision.action === 'take') {
        room.takeCards(defender.id);
        emitState(room, roomId);
        triggerAI(room, roomId);
      }
    }, 1000);
  } else if (attackerIsAI && room.isAttackerTurn()) {
    setTimeout(() => {
      if (room.state !== 'playing') return;
      if (String(room.players[room.attacker]?.id) !== String(attacker.id)) return;

      const decision = aiPlayer.makeDecision(attacker.id);
      if (!decision) return;

      if (decision.action === 'attack') {
        const res = room.attack(attacker.id, decision.card);
        if (res.error) return;
        if (res.gameOver) return handleGameOver(room, roomId, res);
        emitState(room, roomId);
        triggerAI(room, roomId);
      } else if (decision.action === 'pass') {
        const res = room.endRound();
        if (res.gameOver) return handleGameOver(room, roomId, res);
        emitState(room, roomId);
        triggerAI(room, roomId);
      }
    }, 1000);
  }
}

function handleGameOver(room, roomId, result) {
  const playerIds = room.players.filter(p => !String(p.id).startsWith('ai_')).map(p => p.id);
  for (const pid of playerIds) {
    run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [pid]);
  }
  if (result.winner && !String(result.winner).startsWith('ai_')) {
    run('UPDATE users SET games_won = games_won + 1, rating = rating + 10 WHERE id = ?', [result.winner]);
  }
  if (result.durak && !String(result.durak).startsWith('ai_')) {
    run('UPDATE users SET rating = rating - 5 WHERE id = ?', [result.durak]);
  }
  run('INSERT INTO game_history (room_id, winner_id, players, mode, duration) VALUES (?, ?, ?, ?, ?)',
    [roomId, result.winner, JSON.stringify(playerIds), room.mode, Math.floor((Date.now() - room.startedAt) / 1000)]);
  io.to(roomId).emit('game_over', {
    winner: result.winner, durak: result.durak, gameState: result.gameState
  });
}

function getPublicRooms() {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.state === 'waiting') list.push(room.getPublicState());
  }
  return list;
}

async function main() {
  await initDb();
  server.listen(PORT, () => console.log(`Durak running on port ${PORT}`));
}

main().catch(e => { console.error(e); process.exit(1); });
