const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

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
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return deck;
}

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
  SUITS, RANKS, SUIT_SYMBOLS, SUIT_NAMES, RANK_VALUES,
  createDeck, shuffleDeck, canBeat, canAttack, canDefendWith
};
