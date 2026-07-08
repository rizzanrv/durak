const { canBeat, canAttack } = require('./deck');

class AIPlayer {
  constructor(gameRoom, difficulty = 'medium') {
    this.game = gameRoom;
    this.difficulty = difficulty; // easy, medium, hard
    this.isTraining = gameRoom.settings?.isTraining || false;
  }

  getPlayerIndex(playerId) {
    return this.game.players.findIndex(p => p.id === playerId);
  }

  makeDecision(playerId) {
    const player = this.game.players.find(p => p.id === playerId);
    if (!player || player.hand.length === 0) return null;

    const idx = this.getPlayerIndex(playerId);

    if (idx === this.game.defender) {
      return this.defend(player);
    }
    if (idx === this.game.attacker) {
      return this.attack(player);
    }
    return null;
  }

  defend(player) {
    const attacks = this.game.table.filter(t => t.type === 'attack');
    const defenses = this.game.table.filter(t => t.type === 'defense');
    const undefended = attacks.length - defenses.length;

    if (undefended <= 0) return null;

    // Найти первую незащищённую атаку
    let lastAttackCard = null;
    for (const atk of attacks) {
      const hasDefense = defenses.some(def => 
        def.beats && def.beats.suit === atk.card.suit && def.beats.rank === atk.card.rank
      );
      if (!hasDefense) {
        lastAttackCard = atk.card;
        break;
      }
    }

    if (!lastAttackCard) return null;

    const beatable = player.hand.filter(c => canBeat(c, lastAttackCard, this.game.trump));

    // Easy AI - чаще берёт карты
    if (this.difficulty === 'easy') {
      if (beatable.length === 0 || attacks.length > 2 || Math.random() > 0.6) {
        return { action: 'take' };
      }
      // Использует случайную карту из подходящих
      const card = beatable[Math.floor(Math.random() * beatable.length)];
      return { action: 'defend', attackCard: lastAttackCard, defenseCard: card };
    }

    // Medium AI - стандартная логика
    if (this.difficulty === 'medium') {
      if (beatable.length === 0 || attacks.length > 4) return { action: 'take' };
      beatable.sort((a, b) => a.value - b.value);
      return { action: 'defend', attackCard: lastAttackCard, defenseCard: beatable[0] };
    }

    // Hard AI - продвинутая логика
    if (this.difficulty === 'hard') {
      if (beatable.length === 0) return { action: 'take' };
      
      // Анализ стоит ли брать
      const totalAttackValue = attacks.reduce((sum, a) => sum + a.card.value, 0);
      const defenderHand = player.hand.length;
      
      // Если много карт атаки или защитных карт мало
      if (attacks.length > 5 || (attacks.length > 3 && defenderHand < 4)) {
        return { action: 'take' };
      }
      
      // Не бить козырями если можно обычными
      const nonTrumpBeatable = beatable.filter(c => c.suit !== this.game.trump);
      const cardsToUse = nonTrumpBeatable.length > 0 ? nonTrumpBeatable : beatable;
      cardsToUse.sort((a, b) => a.value - b.value);
      
      return { action: 'defend', attackCard: lastAttackCard, defenseCard: cardsToUse[0] };
    }

    // Fallback
    return { action: 'take' };
  }

  attack(player) {
    const tableAttacks = this.game.table.filter(t => t.type === 'attack');
    const defenderHand = this.game.players[this.game.defender]?.hand?.length || 6;

    // Первая атака - играем самую слабую карту
    if (tableAttacks.length === 0) {
      const sorted = [...player.hand].sort((a, b) => a.value - b.value);
      
      if (this.difficulty === 'easy') {
        // Easy - случайная карта
        const card = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
        return { action: 'attack', card };
      }
      
      if (this.difficulty === 'medium') {
        // Medium - самая слабая не козырная
        const nonTrump = sorted.filter(c => c.suit !== this.game.trump);
        const card = nonTrump.length > 0 ? nonTrump[0] : sorted[0];
        return { action: 'attack', card };
      }
      
      if (this.difficulty === 'hard') {
        // Hard - анализ карт противника
        const nonTrump = sorted.filter(c => c.suit !== this.game.trump);
        // Пытаемся найти карты среднего достоинства (не самые слабые)
        const candidates = nonTrump.length > 2 ? nonTrump.slice(1, 3) : nonTrump;
        const card = candidates.length > 0 ? candidates[0] : sorted[0];
        return { action: 'attack', card };
      }
    }

    // Не подкидывать больше карт, чем у защищающегося
    if (tableAttacks.length >= defenderHand) {
      return { action: 'pass' };
    }

    // Найти карты подходящего ранга
    const ranks = tableAttacks.map(t => t.card.rank);
    const tableCards = this.game.table.map(t => t.card);
    const playable = player.hand.filter(c => 
      ranks.includes(c.rank) || tableCards.some(tc => tc.rank === c.rank)
    );

    if (playable.length === 0) return { action: 'pass' };

    if (this.difficulty === 'easy') {
      // Easy - случайная подходящая карта
      const card = playable[Math.floor(Math.random() * playable.length)];
      return { action: 'attack', card };
    }

    // Medium и Hard - играем самую слабую подходящую карту
    playable.sort((a, b) => a.value - b.value);
    const nonTrump = playable.filter(c => c.suit !== this.game.trump);
    return { action: 'attack', card: nonTrump.length > 0 ? nonTrump[0] : playable[0] };
  }

  // Режим обучения - объяснение лучшего хода
  explainBestMove(playerId) {
    const player = this.game.players.find(p => p.id === playerId);
    if (!player) return null;

    const idx = this.getPlayerIndex(playerId);
    
    if (idx === this.game.defender) {
      return this.explainDefense(player);
    }
    if (idx === this.game.attacker) {
      return this.explainAttack(player);
    }
    
    return null;
  }

  explainDefense(player) {
    const attacks = this.game.table.filter(t => t.type === 'attack');
    const defenses = this.game.table.filter(t => t.type === 'defense');

    let lastAttackCard = null;
    for (const atk of attacks) {
      const hasDefense = defenses.some(def => 
        def.beats && def.beats.suit === atk.card.suit && def.beats.rank === atk.card.rank
      );
      if (!hasDefense) {
        lastAttackCard = atk.card;
        break;
      }
    }

    if (!lastAttackCard) {
      return {
        advice: 'Все атаки отбиты. Ждите решения атакующего.',
        explanation: 'Вы успешно отбили все атакующие карты.'
      };
    }

    const beatable = player.hand.filter(c => canBeat(c, lastAttackCard, this.game.trump));
    
    if (beatable.length === 0) {
      return {
        advice: 'Возьмите карты — вам нечем отбиться.',
        explanation: `Атакующая карта: ${lastAttackCard.rank} ${lastAttackCard.suit}. Нужна карта той же масти выше или козырь.`,
        action: 'take'
      };
    }

    const totalCards = attacks.length;
    const handSize = player.hand.length;
    const nonTrumpDefense = beatable.filter(c => c.suit !== this.game.trump);
    
    if (totalCards > 4 && handSize < 5) {
      return {
        advice: 'Лучше возьмите — слишком много атак, а у вас мало карт.',
        explanation: `На столе ${totalCards} атакующих карт, а у вас только ${handSize}. Взять лучше, чем тратить все карты.`,
        action: 'take',
        bestCard: null
      };
    }

    beatable.sort((a, b) => a.value - b.value);
    const bestCard = nonTrumpDefense.length > 0 ? nonTrumpDefense[0] : beatable[0];
    
    const suitNames = { hearts: 'чирва', diamonds: 'бубны', clubs: 'трефы', spades: 'пики' };
    const rankNames = { '6': 'шестёрка', '7': 'семёрка', '8': 'восьмёрка', '9': 'девятка', '10': 'десятка', 'J': 'валет', 'Q': 'дама', 'K': 'король', 'A': 'туз' };
    const cardName = (c) => `${rankNames[c.rank] || c.rank} ${suitNames[c.suit] || c.suit}`;

    return {
      advice: `Отбейтесь: ${cardName(bestCard)}.`,
      explanation: nonTrumpDefense.length > 0 
        ? `Используйте слабую некозырную карту (${cardName(bestCard)}), чтобы сохранить козыри.`
        : `Используйте слабый козырь (${cardName(bestCard)}), другого варианта нет.`,
      action: 'defend',
      bestCard: bestCard,
      attackCard: lastAttackCard
    };
  }

  explainAttack(player) {
    const tableAttacks = this.game.table.filter(t => t.type === 'attack');
    const defenderHand = this.game.players[this.game.defender]?.hand?.length || 6;

    const suitNames = { hearts: 'чирва', diamonds: 'бубны', clubs: 'трефы', spades: 'пики' };
    const rankNames = { '6': 'шестёрка', '7': 'семёрка', '8': 'восьмёрка', '9': 'девятка', '10': 'десятка', 'J': 'валет', 'Q': 'дама', 'K': 'король', 'A': 'туз' };
    const cardName = (c) => `${rankNames[c.rank] || c.rank} ${suitNames[c.suit] || c.suit}`;

    if (tableAttacks.length === 0) {
      const sorted = [...player.hand].sort((a, b) => a.value - b.value);
      const nonTrump = sorted.filter(c => c.suit !== this.game.trump);
      const bestCard = nonTrump.length > 0 ? nonTrump[0] : sorted[0];
      
      return {
        advice: `Атакуйте: ${cardName(bestCard)}.`,
        explanation: nonTrump.length > 0
          ? `Начните со слабой некозырной карты (${cardName(bestCard)}), чтобы проверить защиту и сохранить сильные карты.`
          : `Атакуйте слабой картой (${cardName(bestCard)}), других вариантов нет.`,
        action: 'attack',
        bestCard: bestCard
      };
    }

    if (tableAttacks.length >= defenderHand) {
      return {
        advice: 'Пас — у защищающегося больше нет карт.',
        explanation: `У защищающегося ${defenderHand} карт, а атак уже ${tableAttacks.length}. Подкидывать больше смысла нет.`,
        action: 'pass'
      };
    }

    const ranks = tableAttacks.map(t => t.card.rank);
    const tableCards = this.game.table.map(t => t.card);
    const playable = player.hand.filter(c => 
      ranks.includes(c.rank) || tableCards.some(tc => tc.rank === c.rank)
    );

    if (playable.length === 0) {
      return {
        advice: 'Пас — у вас нет карт нужного достоинства.',
        explanation: `Можно подкинуть только: ${[...new Set(ranks)].join(', ')}. У вас таких нет.`,
        action: 'pass'
      };
    }

    playable.sort((a, b) => a.value - b.value);
    const nonTrump = playable.filter(c => c.suit !== this.game.trump);
    const bestCard = nonTrump.length > 0 ? nonTrump[0] : playable[0];

    return {
      advice: `Подкиньте: ${cardName(bestCard)}.`,
      explanation: nonTrump.length > 0
        ? `Используйте слабую некозырную карту (${cardName(bestCard)}), чтобы надавить на защиту, сохранив козыри.`
        : `Используйте слабый козырь (${cardName(bestCard)}), других подходящих карт нет.`,
      action: 'attack',
      bestCard: bestCard
    };
  }
}

module.exports = AIPlayer;
