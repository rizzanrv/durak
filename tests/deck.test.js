'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { createDeck, shuffleDeck, canBeat, canAttack, RANK_VALUES } = require('../game/deck');

test('createDeck builds the expected number of unique cards', () => {
  for (const [size, expected] of [[24, 24], [36, 36], [52, 52], [72, 72]]) {
    const deck = createDeck(size);
    assert.equal(deck.length, expected, `deck size ${size}`);
    const keys = new Set(deck.map(c => `${c.suit}:${c.rank}`));
    const duplicatesAllowed = size === 72 ? 2 : 1;
    assert.equal(keys.size, expected / duplicatesAllowed, `unique cards for deck size ${size}`);
    for (const card of deck) {
      assert.ok(card.suit && card.rank, 'card has suit and rank');
      assert.equal(card.value, RANK_VALUES[card.rank], `value for ${card.rank}`);
    }
  }
});

test('createDeck falls back to 36 cards for unknown sizes', () => {
  assert.equal(createDeck(99).length, 36);
  assert.equal(createDeck(undefined).length, 36);
});

test('shuffleDeck keeps the same multiset of cards', () => {
  const deck = createDeck(36);
  const shuffled = shuffleDeck(deck);
  assert.equal(shuffled.length, deck.length);
  assert.deepEqual(
    shuffled.map(c => `${c.suit}:${c.rank}`).sort(),
    deck.map(c => `${c.suit}:${c.rank}`).sort()
  );
  assert.notStrictEqual(shuffled, deck, 'returns a copy');
});

test('canBeat follows suit and trump rules', () => {
  const six = { suit: 'spades', rank: '6', value: 6 };
  const seven = { suit: 'spades', rank: '7', value: 7 };
  const trump = 'hearts';
  const smallTrump = { suit: 'hearts', rank: '6', value: 6 };
  const bigTrump = { suit: 'hearts', rank: '7', value: 7 };
  const offSuit = { suit: 'clubs', rank: 'A', value: 14 };

  assert.equal(canBeat(seven, six, trump), true, 'higher card of the same suit');
  assert.equal(canBeat(six, seven, trump), false, 'lower card of the same suit');
  assert.equal(canBeat(smallTrump, offSuit, trump), true, 'trump beats a non-trump');
  assert.equal(canBeat(offSuit, smallTrump, trump), false, 'non-trump cannot beat a trump');
  assert.equal(canBeat(smallTrump, bigTrump, trump), false, 'lower trump loses to higher trump');
  assert.equal(canBeat(bigTrump, smallTrump, trump), true, 'higher trump wins');
});

test('canAttack matches the ranks already on the table', () => {
  assert.equal(canAttack({ rank: '9' }, []), true);
  assert.equal(canAttack({ rank: '9' }, [{ rank: '9' }]), true);
  assert.equal(canAttack({ rank: '9' }, [{ rank: 'K' }]), false);
  assert.equal(canAttack({ rank: '9' }, [{ rank: 'K' }, { rank: '9' }]), true);
});
