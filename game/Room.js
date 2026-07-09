const { createDeck, shuffleDeck, canBeat, canAttack, canDefendWith } = require('./deck');

class GameRoom {
  constructor(id, mode, creatorId, settings = {}) {
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
    
    // Настройки игры
    this.settings = {
      gameType: settings.gameType || 'podkidnoy', // podkidnoy, perevodnoy
      deckSize: settings.deckSize || 36, // 24, 36, 72
      maxPlayers: settings.maxPlayers || 2, // 2-6
      turnTime: settings.turnTime || 60, // секунды, 0 = без ограничения
      aiDifficulty: settings.aiDifficulty || 'medium', // easy, medium, hard
      isTraining: settings.isTraining || false // режим обучения
    };
    
    this.maxPlayers = this.settings.maxPlayers;
    this.minPlayers = 2;
    this.currentTurnStart = null;
    this.faceUpTrump = null;
    this.throwInProgress = false;
    this.throwInBy = null;
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
    const idx = this.players.findIndex(p => p.id === userId);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (this.players.length === 0) {
      this.state = 'finished';
      return;
    }
    if (this.state !== 'playing') return;
    if (this.players.length === 1) {
      this.state = 'finished';
      return;
    }
    if (idx === this.attacker || idx === this.defender) {
      this.attacker = 0;
      this.defender = this.getNextPlayer(0);
      this.table = [];
    } else {
      if (this.attacker >= this.players.length) this.attacker = 0;
      if (this.defender >= this.players.length) this.defender = this.getNextPlayer(this.attacker);
    }
  }

  setReady(userId) {
    const p = this.players.find(p => p.id === userId);
    if (p) p.isReady = true;
  }

  allReady() {
    return this.players.length >= this.minPlayers && this.players.every(p => p.isReady);
  }

  startGame() {
    this.deck = shuffleDeck(createDeck(this.settings.deckSize));
    this.trump = this.deck[this.deck.length - 1].suit;
    this.faceUpTrump = this.deck[this.deck.length - 1];
    this.table = [];
    this.state = 'playing';
    this.startedAt = Date.now();
    this.currentTurnStart = Date.now();

    for (const p of this.players) {
      p.hand = this.deck.splice(0, 6);
    }

    let lowestIdx = 0;
    let lowestVal = Infinity;
    for (let i = 0; i < this.players.length; i++) {
      const trumpCard = this.players[i].hand.find(c => c.suit === this.trump);
      if (trumpCard && trumpCard.value < lowestVal) {
        lowestVal = trumpCard.value;
        lowestIdx = i;
      }
    }
    this.attacker = lowestIdx;
    this.defender = this.getNextPlayer(lowestIdx);
    return this.getState();
  }

  getNextPlayer(idx) {
    let next = (idx + 1) % this.players.length;
    let safety = 0;
    while (this.players[next] && this.players[next].hand.length === 0 && safety < this.players.length) {
      next = (next + 1) % this.players.length;
      safety++;
    }
    return next;
  }

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
    if (!this.players[this.attacker] || this.players[this.attacker].hand.length === 0) {
      this.attacker = this.getNextPlayer(this.attacker);
      this.defender = this.getNextPlayer(this.attacker);
      return { error: 'Attacker has no cards, turn skipped' };
    }
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
    this.resetTurnTimer();

    if (player.hand.length === 0 && this.deck.length === 0) {
      const othersWithCards = this.players.filter(p => p.hand.length > 0);
      if (othersWithCards.length === 1) {
        this.state = 'finished';
        return {
          gameOver: true,
          winner: userId,
          durak: othersWithCards[0].id,
          gameState: this.getState()
        };
      } else if (othersWithCards.length === 0) {
        this.state = 'finished';
        return { gameOver: true, winner: null, durak: null, gameState: this.getState() };
      }
    }

    return this.getState();
  }

  defend(userId, attackCard, defenseCard) {
    if (this.state !== 'playing') return { error: 'Game not started' };
    if (!this.players[this.defender] || this.players[this.defender].hand.length === 0) {
      return { error: 'Defender has no cards' };
    }
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

    if (player.hand.length === 0 && this.deck.length === 0) {
      const allDefended = this.table.filter(t => t.type === 'attack').length === 
                          this.table.filter(t => t.type === 'defense').length;
      if (allDefended) {
        const othersWithCards = this.players.filter(p => p.hand.length > 0);
        if (othersWithCards.length === 0) {
          this.state = 'finished';
          return { gameOver: true, winner: null, durak: null, gameState: this.getState() };
        }
      }
    }

    return this.getState();
  }

  takeCards(userId) {
    if (this.state !== 'playing') return { error: 'Game not started' };
    if (userId !== this.players[this.defender]?.id) return { error: 'Not your turn' };

    const takenCards = this.table.map(t => t.card);
    const player = this.players.find(p => p.id === userId);
    player.hand.push(...takenCards);
    this.table = [];

    this.attacker = this.getNextPlayer(this.defender);
    this.defender = this.getNextPlayer(this.attacker);

    const drawResult = this.drawCards();
    if (drawResult.gameOver) return drawResult;

    if (this.players[this.attacker]?.hand.length === 0) {
      this.attacker = this.getNextPlayer(this.attacker);
      this.defender = this.getNextPlayer(this.attacker);
    }

    this.throwInProgress = this.players.length > 2;
    this.throwInBy = this.throwInProgress ? this.attacker : null;
    return this.getState();
  }

  throwIn(userId, card) {
    if (!this.throwInProgress) return { error: 'Not throw-in phase' };
    if (userId === this.players[this.defender]?.id) return { error: 'Defender cannot throw in' };

    const player = this.players.find(p => p.id === userId);
    if (!player) return { error: 'Player not found' };
    if (!player.hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
      return { error: 'You don\'t have this card' };
    }

    const tableRanks = new Set(this.table.length > 0 
      ? this.table.map(t => t.card.rank) 
      : []);
    if (tableRanks.size > 0 && !tableRanks.has(card.rank)) {
      return { error: 'Card rank not on table' };
    }

    this.removeCardFromHand(userId, card);
    this.table.push({ card, type: 'attack', by: userId });

    this.throwInBy = this.getNextNonDefender(this.throwInBy);
    if (!this.throwInBy || this.throwInBy === this.attacker) {
      this.throwInProgress = false;
      this.throwInBy = null;
    }

    return this.getState();
  }

  passThrowIn(userId) {
    if (!this.throwInProgress) return { error: 'Not throw-in phase' };
    this.throwInBy = this.getNextNonDefender(this.throwInBy);
    if (!this.throwInBy || this.throwInBy === this.attacker) {
      this.throwInProgress = false;
      this.throwInBy = null;
    }
    return this.getState();
  }

  getNextNonDefender(idx) {
    if (idx === undefined || idx === null) return null;
    let next = (idx + 1) % this.players.length;
    let safety = 0;
    while (safety < this.players.length) {
      if (this.players[next] && next !== this.defender && this.players[next].hand.length > 0) {
        return next;
      }
      next = (next + 1) % this.players.length;
      safety++;
    }
    return null;
  }

  endRound() {
    if (this.state !== 'playing') return { error: 'Game not started' };

    this.table = [];
    this.attacker = this.defender;
    this.defender = this.getNextPlayer(this.attacker);

    const drawResult = this.drawCards();
    if (drawResult.gameOver) return drawResult;

    if (this.players[this.attacker]?.hand.length === 0) {
      this.attacker = this.getNextPlayer(this.attacker);
      this.defender = this.getNextPlayer(this.attacker);
    }

    const playersWithCards = this.players.filter(p => p.hand.length > 0);
    if (playersWithCards.length <= 1 && this.deck.length === 0) {
      this.state = 'finished';
      const durak = playersWithCards.length === 1 ? playersWithCards[0] : null;
      let winner = null;
      if (durak) {
        winner = this.players.find(p => p.hand.length === 0 && p.id !== durak.id);
      }
      return { gameOver: true, winner: winner?.id || null, durak: durak?.id || null, gameState: this.getState() };
    }

    return this.getState();
  }

  passAttack(userId) {
    if (this.mode !== 'transfer') return { error: 'Mode doesn\'t support transfer' };
    if (userId !== this.players[this.attacker]?.id) return { error: 'Not your turn' };

    this.attacker = this.getNextPlayer(this.attacker);
    if (this.attacker === this.defender) {
      this.attacker = this.getNextPlayer(this.attacker);
    }
    this.defender = this.getNextPlayer(this.attacker);
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
      if (!p || p.hand.length === 0 && this.deck.length === 0) continue;
      while (p.hand.length < 6 && this.deck.length > 0) {
        p.hand.push(this.deck.shift());
      }
    }

    // Проверка окончания игры
    const playersWithCards = this.players.filter(p => p.hand.length > 0);
    if (playersWithCards.length <= 1 && this.deck.length === 0) {
      this.state = 'finished';
      const durak = playersWithCards.length === 1 ? playersWithCards[0] : null;
      let winner = null;
      if (durak) {
        winner = this.players.find(p => p.hand.length === 0 && p.id !== durak.id);
      }
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
      isAttackerTurn: this.isAttackerTurn(),
      settings: this.settings,
      turnTimeRemaining: this.getTurnTimeRemaining(),
      faceUpTrump: this.faceUpTrump,
      throwInProgress: this.throwInProgress,
      throwInBy: this.throwInBy
    };
  }

  getPublicState() {
    return {
      id: this.id, mode: this.mode, state: this.state,
      players: this.players.map(p => ({
        id: p.id, username: p.username,
        handCount: p.hand.length, isReady: p.isReady
      })),
      maxPlayers: this.maxPlayers, createdAt: this.createdAt,
      settings: this.settings
    };
  }

  getTurnTimeRemaining() {
    if (!this.settings.turnTime || this.settings.turnTime === 0) return null;
    if (!this.currentTurnStart) return this.settings.turnTime;
    const elapsed = Math.floor((Date.now() - this.currentTurnStart) / 1000);
    return Math.max(0, this.settings.turnTime - elapsed);
  }

  resetTurnTimer() {
    this.currentTurnStart = Date.now();
  }

  exchangeTrump6(userId) {
    if (this.state !== 'playing') return { error: 'Game not started' };
    if (this.deck.length === 0) return { error: 'Talon is empty' };
    if (!this.faceUpTrump) return { error: 'No face-up trump' };

    const player = this.players.find(p => p.id === userId);
    if (!player) return { error: 'Player not found' };

    const trump6Idx = player.hand.findIndex(c => c.suit === this.trump && c.rank === '6');
    if (trump6Idx === -1) return { error: 'You don\'t have trump 6' };

    const trump6 = player.hand[trump6Idx];
    const faceUp = this.faceUpTrump;

    player.hand.splice(trump6Idx, 1);
    player.hand.push(faceUp);

    const deckIdx = this.deck.findIndex(c => c.suit === faceUp.suit && c.rank === faceUp.rank);
    if (deckIdx !== -1) {
      this.deck.splice(deckIdx, 1);
    }
    this.deck.push(trump6);

    this.faceUpTrump = null;
    return this.getState();
  }

  canTransfer(playerId, card) {
    if (this.settings.gameType !== 'perevodnoy') return false;
    if (playerId !== this.players[this.defender]?.id) return false;
    if (this.table.length !== 1) return false; // Только первая карта
    const attackCard = this.table[0].card;
    return card.rank === attackCard.rank;
  }

  transfer(playerId, card) {
    if (!this.canTransfer(playerId, card)) {
      return { error: 'Cannot transfer this card' };
    }

    this.removeCardFromHand(playerId, card);
    this.table.push({ card, type: 'transfer', by: playerId });

    const oldDefender = this.defender;
    this.defender = this.getNextPlayer(this.defender);
    
    if (this.defender === this.attacker) {
      const takenCards = this.table.map(t => t.card);
      const player = this.players[this.attacker];
      player.hand.push(...takenCards);
      this.table = [];
      this.attacker = this.getNextPlayer(this.attacker);
      this.defender = this.getNextPlayer(this.attacker);
      const drawResult = this.drawCards();
      if (drawResult.gameOver) return drawResult;
    }

    this.resetTurnTimer();
    return this.getState();
  }
}

module.exports = GameRoom;
