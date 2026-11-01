'use strict';

const test = require('node:test');
const assert = require('node:assert');

const GameRoom = require('../game/Room');

const VALUES = { 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };

function card(suit, rank) {
  return { suit, rank, value: VALUES[rank] };
}

function makeRoom({ players = 2, deckSize = 36, mode = 'classic', settings = {} } = {}) {
  const room = new GameRoom('room-test', mode, 'p1', {
    deckSize,
    maxPlayers: Math.max(players, 2),
    turnTime: 0,
    ...settings
  });
  for (let i = 0; i < players; i++) {
    room.addPlayer(`p${i + 1}`, `Player ${i + 1}`);
  }
  return room;
}

function startedRoom(options) {
  const room = makeRoom(options);
  for (const player of room.players) room.setReady(player.id);
  room.startGame();
  return room;
}

test('startGame deals six cards each and picks the lowest trump as attacker', () => {
  const room = startedRoom();

  assert.equal(room.state, 'playing');
  for (const player of room.players) assert.equal(player.hand.length, 6);
  assert.equal(room.deck.length, 36 - 12);
  assert.notEqual(room.attacker, room.defender);

  const withTrump = room.players
    .map((player, index) => ({ player, index }))
    .filter(x => x.player.hand.some(c => c.suit === room.trump));

  if (withTrump.length > 0) {
    const lowest = withTrump.reduce((best, cur) => {
      const bestMin = Math.min(...best.player.hand.filter(c => c.suit === room.trump).map(c => c.value));
      const curMin = Math.min(...cur.player.hand.filter(c => c.suit === room.trump).map(c => c.value));
      return curMin < bestMin ? cur : best;
    });
    assert.equal(room.attacker, lowest.index);
  }
});

test('attack rejects wrong turn, foreign cards and mismatched ranks', () => {
  const room = startedRoom();
  const attackerId = room.players[room.attacker].id;
  const defenderId = room.players[room.defender].id;

  assert.match(room.attack(defenderId, room.players[room.defender].hand[0]).error, /Not your turn/);
  assert.match(room.attack(attackerId, room.players[room.defender].hand[0]).error, /don't have this card/);

  const first = room.players[room.attacker].hand[0];
  assert.ok(!room.attack(attackerId, first).error, 'first attack is allowed');

  const otherRank = room.players[room.attacker].hand.find(c => c.rank !== first.rank);
  if (otherRank) {
    assert.match(room.attack(attackerId, otherRank).error, /can't be added to attack/);
  }
});

test('never more attacks than the defender has cards', () => {
  const room = startedRoom();
  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];

  attacker.hand = [card('spades', '6'), card('spades', '6')];
  defender.hand = [card('clubs', '7')];
  room.deck = [];
  room.table = [];

  assert.ok(!room.attack(attacker.id, attacker.hand[0]).error, 'first attack allowed');
  assert.match(room.attack(attacker.id, attacker.hand[0]).error, /no cards left to beat/);
});

test('defend only accepts an attack that is actually on the table', () => {
  const room = startedRoom();
  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];

  room.trump = 'hearts';
  room.table = [{ card: card('diamonds', '9'), type: 'attack', by: attacker.id }];
  defender.hand = [card('diamonds', 'K')];

  assert.match(room.defend(defender.id, card('clubs', '9'), defender.hand[0]).error, /not on the table/);
  assert.ok(!room.defend(defender.id, card('diamonds', '9'), card('diamonds', 'K')).error);
  assert.equal(room.table.filter(t => t.type === 'defense').length, 1);
});

test('the same attack cannot be beaten twice', () => {
  const room = startedRoom();
  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];

  room.table = [{ card: card('spades', '8'), type: 'attack', by: attacker.id }];
  defender.hand = [card('spades', '10'), card('spades', 'J')];

  assert.ok(!room.defend(defender.id, card('spades', '8'), card('spades', '10')).error);
  assert.match(room.defend(defender.id, card('spades', '8'), card('spades', 'J')).error, /not on the table/);
});

test('takeCards refuses an empty table', () => {
  const room = startedRoom();
  room.table = [];
  assert.match(room.takeCards(room.players[room.defender].id).error, /Nothing to take/);
});

test('takeCards moves the table into the defender hand', () => {
  const room = startedRoom();
  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];

  room.table = [{ card: card('spades', '8'), type: 'attack', by: attacker.id }];
  room.deck = [];
  const handBefore = defender.hand.length;

  assert.ok(!room.takeCards(defender.id).error, 'taking is allowed');
  assert.equal(room.table.length, 0);
  assert.equal(room.players.find(p => p.id === defender.id).hand.length, handBefore + 1);
  assert.notEqual(room.attacker, room.defender);
});

test('endRound refuses to close a round with undefended attacks', () => {
  const room = startedRoom();
  const attacker = room.players[room.attacker];

  room.table = [
    { card: card('spades', '8'), type: 'attack', by: attacker.id },
    { card: card('spades', '9'), type: 'attack', by: attacker.id }
  ];
  assert.match(room.endRound().error, /Not all attacks are defended/);
});

test('endRound makes the defender the next attacker', () => {
  const room = startedRoom();
  const previousDefenderId = room.players[room.defender].id;

  room.table = [];
  assert.ok(!room.endRound().error, 'empty table closes the round');
  assert.equal(room.players[room.attacker].id, previousDefenderId);
});

test('getStateFor hides opponent hands but keeps own hand and counts', () => {
  const room = startedRoom();
  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];

  const view = room.getStateFor(attacker.id);
  const self = view.players.find(p => p.id === attacker.id);
  const opponent = view.players.find(p => p.id === defender.id);

  assert.equal(view.you, attacker.id);
  assert.deepEqual(self.hand, attacker.hand, 'own hand is visible');
  assert.deepEqual(opponent.hand, [], 'opponent hand is hidden');
  assert.equal(opponent.handCount, defender.hand.length, 'opponent hand size stays public');
});

test('getState still exposes hands for server-side code', () => {
  const room = startedRoom();
  for (const player of room.getState().players) {
    assert.equal(player.hand.length, player.handCount);
  }
});

test('removePlayer keeps the turn when a bystander leaves', () => {
  const room = startedRoom({ players: 3, mode: 'transfer' });
  const attackerId = room.players[room.attacker].id;
  const bystander = room.players.find((p, index) => index !== room.attacker && index !== room.defender);

  room.removePlayer(bystander.id);

  assert.equal(room.players[room.attacker].id, attackerId, 'attacker unchanged');
  assert.notEqual(room.attacker, room.defender, 'attacker and defender stay distinct');
  assert.equal(room.players.length, 2);
});

test('removePlayer resets the table when the active player leaves', () => {
  const room = startedRoom({ players: 3, mode: 'transfer' });
  const defenderId = room.players[room.defender].id;

  room.table = [{ card: card('spades', '8'), type: 'attack', by: room.players[room.attacker].id }];
  room.removePlayer(defenderId);

  assert.equal(room.table.length, 0, 'table is cleared');
  assert.equal(room.players.length, 2);
  assert.ok(room.attacker >= 0 && room.attacker < room.players.length);
  assert.ok(room.defender >= 0 && room.defender < room.players.length);
});

test('exchangeTrump6 swaps the face-up card for the trump six', () => {
  const room = startedRoom();
  const player = room.players[room.attacker];

  room.trump = 'hearts';
  room.faceUpTrump = card('hearts', 'A');
  room.deck = [card('hearts', 'A'), card('clubs', '6')];
  player.hand = [card('hearts', '6'), card('clubs', '7')];

  assert.ok(!room.exchangeTrump6(player.id).error);
  assert.equal(room.faceUpTrump, null);
  assert.ok(player.hand.some(c => c.suit === 'hearts' && c.rank === 'A'), 'trump ace is in hand');
  assert.ok(room.deck.some(c => c.suit === 'hearts' && c.rank === '6'), 'trump six went to the deck');
});

test('exchangeTrump6 is rejected without a trump six or a talon', () => {
  const room = startedRoom();
  const player = room.players[room.attacker];

  room.trump = 'hearts';
  room.faceUpTrump = card('hearts', 'A');
  room.deck = [card('hearts', 'A')];
  player.hand = [card('clubs', '7')];
  assert.match(room.exchangeTrump6(player.id).error, /don't have trump 6/);

  player.hand = [card('hearts', '6')];
  room.deck = [];
  assert.match(room.exchangeTrump6(player.id).error, /Talon is empty/);
});

test('transfer in perevodnoy mode requires the matching rank', () => {
  const room = startedRoom({ mode: 'perevodnoy' });
  const attacker = room.players[room.attacker];
  const defender = room.players[room.defender];

  room.table = [{ card: card('spades', '9'), type: 'attack', by: attacker.id }];
  defender.hand = [card('spades', '9'), card('clubs', 'K')];
  attacker.hand = [card('clubs', '6'), card('clubs', '7')];

  assert.equal(room.canTransfer(defender.id, card('clubs', 'K')), false, 'rank mismatch');
  assert.equal(room.canTransfer(defender.id, card('spades', '9')), true, 'matching rank');
  assert.match(room.transfer(defender.id, card('clubs', 'K')).error, /Cannot transfer/);
});

test('a full AI round keeps the deck, table and hands consistent', () => {
  const room = startedRoom({ players: 2 });
  const total = 36;
  const attackerId = room.players[room.attacker].id;
  const defenderId = room.players[room.defender].id;

  const counts = () => {
    const keys = [
      ...room.deck.map(c => `${c.suit}:${c.rank}`),
      ...room.table.map(t => `${t.card.suit}:${t.card.rank}`),
      ...room.players.flatMap(p => p.hand.map(c => `${c.suit}:${c.rank}`))
    ];
    return { size: keys.length, unique: new Set(keys).size };
  };

  const card = room.players[room.attacker].hand[0];
  assert.ok(!room.attack(attackerId, card).error);

  const defence = room.players[room.defender].hand.find(
    c => (c.suit === card.suit || c.suit === room.trump) && c.value > card.value
  );

  if (defence) {
    assert.ok(!room.defend(defenderId, card, defence).error);

    // nothing left play yet: every card is in the deck, on the table or in a hand
    const inPlay = counts();
    assert.equal(inPlay.size, total, 'no cards lost mid-round');
    assert.equal(inPlay.unique, total, 'no duplicated cards');

    // beaten cards go to the discard pile, so the round closes with 2 fewer
    assert.ok(!room.endRound().error);
    assert.equal(counts().size, total - 2);
  } else {
    // taking cards must never lose anything
    assert.ok(!room.takeCards(defenderId).error);
    const inPlay = counts();
    assert.equal(inPlay.size, total);
    assert.equal(inPlay.unique, total);
  }
});
