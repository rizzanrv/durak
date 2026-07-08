const { canBeat, canAttack } = require('./deck');

class AIPlayer {
  constructor(gameRoom) {
    this.game = gameRoom;
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

    // Принять карты если их слишком много или нечем бить
    if (beatable.length === 0 || attacks.length > 4) return { action: 'take' };

    // Использовать самую слабую карту для защиты
    beatable.sort((a, b) => a.value - b.value);
    return { action: 'defend', attackCard: lastAttackCard, defenseCard: beatable[0] };
  }

  attack(player) {
    const tableAttacks = this.game.table.filter(t => t.type === 'attack');
    const defenderHand = this.game.players[this.game.defender]?.hand?.length || 6;

    // Первая атака - играем самую слабую карту
    if (tableAttacks.length === 0) {
      const sorted = [...player.hand].sort((a, b) => a.value - b.value);
      const nonTrump = sorted.filter(c => c.suit !== this.game.trump);
      const card = nonTrump.length > 0 ? nonTrump[0] : sorted[0];
      return { action: 'attack', card };
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

    // Играем самую слабую подходящую карту (не козыря если возможно)
    playable.sort((a, b) => a.value - b.value);
    const nonTrump = playable.filter(c => c.suit !== this.game.trump);
    return { action: 'attack', card: nonTrump.length > 0 ? nonTrump[0] : playable[0] };
  }
}

module.exports = AIPlayer;
