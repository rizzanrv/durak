const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const ALL_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SUIT_SYMBOLS = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660'
};

const SUIT_NAMES = {
  hearts: 'chervi',
  diamonds: 'bubni',
  clubs: 'trefoley',
  spades: 'piki'
};

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function createDeck(size = 36) {
  const deck = [];
  let ranks;
  
  // Определяем какие ранги использовать
  if (size === 24) {
    ranks = ['9', '10', 'J', 'Q', 'K', 'A']; // 6 рангов * 4 масти = 24
  } else if (size === 36) {
    ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // 9 рангов * 4 масти = 36
  } else if (size === 52) {
    ranks = ALL_RANKS; // 13 рангов * 4 масти = 52
  } else if (size === 72) {
    // Две колоды по 36
    for (let i = 0; i < 2; i++) {
      ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      for (const suit of SUITS) {
        for (const rank of ranks) {
          deck.push({ suit, rank, value: RANK_VALUES[rank] });
        }
      }
    }
    return deck;
  } else {
    // По умолчанию 36
    ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  }
  
  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return deck;
}

// Для обратной совместимости
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function canBeat(card, target, trump) {
  if (card.suit === target.suit) {
    return card.value > target.value;
  }
  if (card.suit === trump && target.suit !== trump) {
    return true;
  }
  return false;
}

function canAttack(card, tableCards) {
  if (tableCards.length === 0) return true;
  const ranks = tableCards.map(c => c.rank);
  return ranks.includes(card.rank);
}

function canDefendWith(card, attackCard, trump) {
  return canBeat(card, attackCard, trump);
}

module.exports = {
  SUITS, RANKS, ALL_RANKS, SUIT_SYMBOLS, SUIT_NAMES, RANK_VALUES,
  createDeck, shuffleDeck, canBeat, canAttack, canDefendWith
};
