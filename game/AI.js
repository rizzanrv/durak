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
        advice: 'All attacks are defended. Wait for attacker\'s decision.',
        explanation: 'You have successfully defended all attacking cards.'
      };
    }

    const beatable = player.hand.filter(c => canBeat(c, lastAttackCard, this.game.trump));
    
    if (beatable.length === 0) {
      return {
        advice: 'Take the cards - you have no cards to defend.',
        explanation: `The attack card is ${lastAttackCard.rank} of ${lastAttackCard.suit}. You need a higher card of the same suit or a trump card.`,
        action: 'take'
      };
    }

    // Анализ ситуации
    const totalCards = attacks.length;
    const handSize = player.hand.length;
    const nonTrumpDefense = beatable.filter(c => c.suit !== this.game.trump);
    
    if (totalCards > 4 && handSize < 5) {
      return {
        advice: 'Consider taking the cards - too many attacks and you have few cards.',
        explanation: `There are ${totalCards} attack cards and you only have ${handSize} cards in hand. Taking might be better than using all your cards.`,
        action: 'take',
        bestCard: null
      };
    }

    beatable.sort((a, b) => a.value - b.value);
    const bestCard = nonTrumpDefense.length > 0 ? nonTrumpDefense[0] : beatable[0];
    
    return {
      advice: `Defend with ${bestCard.rank} of ${bestCard.suit}.`,
      explanation: nonTrumpDefense.length > 0 
        ? `Use the weakest non-trump card (${bestCard.rank} ${bestCard.suit}) to save your trumps for later.`
        : `Use your weakest trump (${bestCard.rank} ${bestCard.suit}) since you have no other options.`,
      action: 'defend',
      bestCard: bestCard,
      attackCard: lastAttackCard
    };
  }

  explainAttack(player) {
    const tableAttacks = this.game.table.filter(t => t.type === 'attack');
    const defenderHand = this.game.players[this.game.defender]?.hand?.length || 6;

    // Первая атака
    if (tableAttacks.length === 0) {
      const sorted = [...player.hand].sort((a, b) => a.value - b.value);
      const nonTrump = sorted.filter(c => c.suit !== this.game.trump);
      const bestCard = nonTrump.length > 0 ? nonTrump[0] : sorted[0];
      
      return {
        advice: `Attack with ${bestCard.rank} of ${bestCard.suit}.`,
        explanation: nonTrump.length > 0
          ? `Start with your weakest non-trump card (${bestCard.rank} ${bestCard.suit}) to test the defender and save strong cards.`
          : `Attack with your weakest card (${bestCard.rank} ${bestCard.suit}) since you only have trumps.`,
        action: 'attack',
        bestCard: bestCard
      };
    }

    // Проверка можно ли ещё подкидывать
    if (tableAttacks.length >= defenderHand) {
      return {
        advice: 'Pass - defender has no more cards.',
        explanation: `The defender only has ${defenderHand} cards, and there are already ${tableAttacks.length} attacks. No point in adding more.`,
        action: 'pass'
      };
    }

    // Найти подходящие карты
    const ranks = tableAttacks.map(t => t.card.rank);
    const tableCards = this.game.table.map(t => t.card);
    const playable = player.hand.filter(c => 
      ranks.includes(c.rank) || tableCards.some(tc => tc.rank === c.rank)
    );

    if (playable.length === 0) {
      return {
        advice: 'Pass - you have no matching rank cards.',
        explanation: `You can only add cards with ranks: ${[...new Set(ranks)].join(', ')}. You don't have any.`,
        action: 'pass'
      };
    }

    playable.sort((a, b) => a.value - b.value);
    const nonTrump = playable.filter(c => c.suit !== this.game.trump);
    const bestCard = nonTrump.length > 0 ? nonTrump[0] : playable[0];

    return {
      advice: `Add ${bestCard.rank} of ${bestCard.suit} to the attack.`,
      explanation: nonTrump.length > 0
        ? `Use your weakest matching non-trump card (${bestCard.rank} ${bestCard.suit}) to pressure the defender while saving trumps.`
        : `Use your weakest matching trump (${bestCard.rank} ${bestCard.suit}) since you have no other matching cards.`,
      action: 'attack',
      bestCard: bestCard
    };
  }
}

module.exports = AIPlayer;
