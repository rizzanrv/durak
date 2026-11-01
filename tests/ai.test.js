'use strict';

const test = require('node:test');
const assert = require('node:assert');

const GameRoom = require('../game/Room');
const AIPlayer = require('../game/AI');
const { canBeat } = require('../game/deck');

function startedRoom(players = 2) {
  const room = new GameRoom('ai-test', 'classic', 'p1', {
    deckSize: 36,
    maxPlayers: players,
    turnTime: 0
  });
  for (let i = 0; i < players; i++) room.addPlayer(`p${i + 1}`, `Player ${i + 1}`);
  for (const player of room.players) room.setReady(player.id);
  room.startGame();
  return room;
}

/* Drive the room with AI decisions until it finishes. */
function playGame(room, maxSteps = 5000) {
  let steps = 0;

  while (room.state === 'playing' && steps < maxSteps) {
    steps++;
    const ai = new AIPlayer(room);
    const defenderId = room.players[room.defender].id;
    const attackerId = room.players[room.attacker].id;

    if (room.isDefenderTurn()) {
      const decision = ai.makeDecision(defenderId) || { action: 'take' };
      if (decision.action === 'defend') {
        const result = room.defend(defenderId, decision.attackCard, decision.defenseCard);
        if (result.error) {
          const fallback = room.takeCards(defenderId);
          if (fallback.error) return { steps, error: `take after failed defence: ${fallback.error}` };
        }
      } else {
        const result = room.takeCards(defenderId);
        if (result.error) return { steps, error: `take: ${result.error}` };
      }
    } else {
      const decision = ai.makeDecision(attackerId) || { action: 'pass' };
      if (decision.action === 'attack') {
        const result = room.attack(attackerId, decision.card);
        if (result.error) {
          const closed = room.endRound();
          if (closed.error) return { steps, error: `endRound after failed attack: ${closed.error}` };
        }
      } else {
        const closed = room.endRound();
        if (closed.error) return { steps, error: `endRound: ${closed.error}` };
      }
    }
  }

  return { steps };
}

test('AI attacks only with cards it actually holds', () => {
  for (let i = 0; i < 100; i++) {
    const room = startedRoom();
    const ai = new AIPlayer(room);
    const attacker = room.players[room.attacker];
    const decision = ai.makeDecision(attacker.id);

    if (decision && decision.action === 'attack') {
      const holds = attacker.hand.some(c => c.suit === decision.card.suit && c.rank === decision.card.rank);
      assert.ok(holds, 'AI plays a card from its own hand');
      assert.ok(!room.attack(attacker.id, decision.card).error, 'AI attack passes room validation');
    }
  }
});

test('AI defence always beats the attack it answers', () => {
  for (let i = 0; i < 100; i++) {
    const room = startedRoom();
    const attackerId = room.players[room.attacker].id;
    const first = room.players[room.attacker].hand[0];
    assert.ok(!room.attack(attackerId, first).error);

    const ai = new AIPlayer(room);
    const defenderId = room.players[room.defender].id;
    const decision = ai.makeDecision(defenderId);

    if (decision && decision.action === 'defend') {
      assert.ok(
        canBeat(decision.defenseCard, decision.attackCard, room.trump),
        `AI defence ${decision.defenseCard.rank}${decision.defenseCard.suit} beats ${decision.attackCard.rank}${decision.attackCard.suit}`
      );
      assert.match(decision.attackCard.rank, new RegExp(`^${first.rank}$`), 'answers the card on the table');
    }
  }
});

test('AI returns null when it is not its turn', () => {
  const room = startedRoom(3);
  const ai = new AIPlayer(room);
  const idle = room.players.find((p, index) => index !== room.attacker && index !== room.defender);

  assert.equal(ai.makeDecision(idle.id), null);
  assert.equal(ai.makeDecision('nobody'), null);
});

test('AI vs AI games finish without losing or duplicating cards', () => {
  for (let game = 0; game < 20; game++) {
    const room = startedRoom(2);
    const result = playGame(room);

    assert.ok(!result.error, `game ${game}: ${result.error} (step ${result.steps})`);
    assert.equal(room.state, 'finished', `game ${game} reached a result in ${result.steps} steps`);

    const keys = [
      ...room.deck.map(c => `${c.suit}:${c.rank}`),
      ...room.table.map(t => `${t.card.suit}:${t.card.rank}`),
      ...room.players.flatMap(p => p.hand.map(c => `${c.suit}:${c.rank}`))
    ];
    assert.equal(new Set(keys).size, keys.length, `game ${game} has duplicated cards`);
    assert.ok(keys.length <= 36, `game ${game} invented cards`);
  }
});

test('three-player AI games also finish', () => {
  for (let game = 0; game < 10; game++) {
    const room = startedRoom(3);
    const result = playGame(room);
    assert.ok(!result.error, `game ${game}: ${result.error} (step ${result.steps})`);
    assert.equal(room.state, 'finished', `game ${game} reached a result in ${result.steps} steps`);
  }
});
