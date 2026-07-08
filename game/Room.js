const { createDeck, shuffleDeck, canBeat, canAttack, canDefendWith } = require('./deck');

class GameRoom {
  constructor(id, mode, creatorId) {
    this.id = id;
    this.mode = mode;
    this.creatorId = creatorId;
    this.players = [];
    this.state = 'waiting';
    this.trump = null;
    this.deck = [];
    this.table = [];
    this.attacker = null;
    this.defender = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.maxPlayers = this.getMaxPlayers(mode);
    this.minPlayers = 2;
  }

  getMaxPlayers(mode) {
    switch (mode) {
      case 'classic': return 2;
      case 'transfer': return 6;
      default: return 6;
    }
  }

  addPlayer(userId, username) {
    if (this.players.length >= this.maxPlayers) return false;
    if (this.players.find(p => p.id === userId)) return false;
    this.players.push({ id: userId, username, hand: [], isReady: false });
    return true;
  }

  removePlayer(userId) {
    this.players = this.players.filter(p => p.id !== userId);
    if (this.players.length === 0) this.state = 'finished';
  }

  setReady(userId) {
    const p = this.players.find(p => p.id === userId);
    if (p) p.isReady = true;
  }

  allReady() {
    return this.players.length >= this.minPlayers && this.players.every(p => p.isReady);
  }

  startGame() {
    this.deck = shuffleDeck(createDeck());
    this.trump = this.deck[this.deck.length - 1].suit;
    this.table = [];
    this.state = 'playing';
    this.startedAt = Date.now();

    for (const p of this.players) {
      p.hand = this.deck.splice(0, 6);
    }

    this.attacker = 0;
    this.defender = 1;
    return this.getState();
  }

  getNextPlayer(idx) { return (idx + 1) % this.players.length; }

  canAddToAttack(card) {
    if (this.table.length === 0) return true;
    // Проверяем все карты на столе (и атакующие и защищающиеся)
    const tableRanks = new Set(this.table.map(t => t.card.rank));
    return tableRanks.has(card.rank);
  }

  removeCardFromHand(userId, card) {
    const p = this.players.find(p => p.id === userId);
    if (!p) return false;
    const idx = p.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx === -1) return false;
    p.hand.splice(idx, 1);
    return true;
  }

  attack(userId, card) {
    if (this.state !== 'playing') return { error: 'Game not started' };
    if (userId !== this.players[this.attacker]?.id) return { error: 'Not your turn to attack' };

    const player = this.players.find(p => p.id === userId);
    if (!player.hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
      return { error: 'You don\'t have this card' };
    }

    if (this.table.length > 0 && !this.canAddToAttack(card)) {
      return { error: 'Card can\'t be added to attack' };
    }

    if (this.table.filter(t => t.type === 'attack').length >= 6) {
      return { error: 'Max 6 attacks per round' };
    }

    this.removeCardFromHand(userId, card);
    this.table.push({ card, type: 'attack', by: userId });

    return this.getState();
  }

  defend(userId, attackCard, defenseCard) {
    if (this.state !== 'playing') return { error: 'Game not started' };
    if (userId !== this.players[this.defender]?.id) return { error: 'Not your turn to defend' };

    const player = this.players.find(p => p.id === userId);
    if (!player.hand.some(c => c.suit === defenseCard.suit && c.rank === defenseCard.rank)) {
      return { error: 'You don\'t have this card' };
    }

    if (!canDefendWith(defenseCard, attackCard, this.trump)) {
      return { error: 'Card can\'t beat this attack' };
    }

    this.removeCardFromHand(userId, defenseCard);
    this.table.push({ card: defenseCard, type: 'defense', by: userId, beats: attackCard });

    return this.getState();
  }

  takeCards(userId) {
    if (this.state !== 'playing') return { error: 'Game not started' };
    if (userId !== this.players[this.defender]?.id) return { error: 'Not your turn' };

    const takenCards = this.table.map(t => t.card);
    const player = this.players.find(p => p.id === userId);
    player.hand.push(...takenCards);
    this.table = [];

    this.attacker = this.defender;
    this.defender = this.getNextPlayer(this.attacker);

    const drawResult = this.drawCards();
    if (drawResult.gameOver) return drawResult;
    return this.getState();
  }

  endRound() {
    if (this.state !== 'playing') return { error: 'Game not started' };

    this.table = [];
    this.attacker = this.defender;
    this.defender = this.getNextPlayer(this.attacker);

    const drawResult = this.drawCards();
    if (drawResult.gameOver) return drawResult;
    return this.getState();
  }

  passAttack(userId) {
    if (this.mode !== 'transfer') return { error: 'Mode doesn\'t support transfer' };
    if (userId !== this.players[this.attacker]?.id) return { error: 'Not your turn' };

    this.attacker = this.getNextPlayer(this.attacker);
    return { ok: true };
  }

  drawCards() {
    // Сначала добираем атакующему, потом остальным по часовой, потом защищающемуся
    const drawOrder = [];
    
    // Атакующий первый
    if (this.players[this.attacker]) {
      drawOrder.push(this.attacker);
    }
    
    // Остальные игроки (кроме защищающегося)
    for (let i = 0; i < this.players.length; i++) {
      if (i !== this.attacker && i !== this.defender) {
        drawOrder.push(i);
      }
    }
    
    // Защищающийся последний
    if (this.players[this.defender]) {
      drawOrder.push(this.defender);
    }

    // Добираем карты в правильном порядке
    for (const idx of drawOrder) {
      const p = this.players[idx];
      while (p.hand.length < 6 && this.deck.length > 0) {
        p.hand.push(this.deck.shift());
      }
    }

    // Проверка окончания игры
    const playersWithCards = this.players.filter(p => p.hand.length > 0);
    if (playersWithCards.length <= 1 && this.deck.length === 0) {
      this.state = 'finished';
      const durak = playersWithCards.length === 1 ? playersWithCards[0] : null;
      const winner = this.players.find(p => p.hand.length === 0 && p.id !== durak?.id);
      return {
        gameOver: true,
        winner: winner?.id || null,
        durak: durak?.id || null,
        gameState: this.getState()
      };
    }

    return { ok: true };
  }

  isDefenderTurn() {
    return this.table.some(t => t.type === 'attack') &&
           this.table.filter(t => t.type === 'attack').length >
           this.table.filter(t => t.type === 'defense').length;
  }

  isAttackerTurn() {
    return !this.isDefenderTurn();
  }

  getState() {
    return {
      id: this.id,
      mode: this.mode,
      state: this.state,
      trump: this.trump,
      deckCount: this.deck.length,
      table: [...this.table],
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        handCount: p.hand.length,
        hand: p.hand,
        isReady: p.isReady
      })),
      attacker: this.attacker,
      defender: this.defender,
      isDefenderTurn: this.isDefenderTurn(),
      isAttackerTurn: this.isAttackerTurn()
    };
  }

  getPublicState() {
    return {
      id: this.id, mode: this.mode, state: this.state,
      players: this.players.map(p => ({
        id: p.id, username: p.username,
        handCount: p.hand.length, isReady: p.isReady
      })),
      maxPlayers: this.maxPlayers, createdAt: this.createdAt
    };
  }
}

module.exports = GameRoom;
