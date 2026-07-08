// Тест основной логики игры
const GameRoom = require('./game/Room');
const AIPlayer = require('./game/AI');

console.log('🎮 Тестирование игровой логики Дурак...\n');

// Тест 1: Создание комнаты и добавление игроков
console.log('✅ Тест 1: Создание комнаты');
const room = new GameRoom('test1', 'classic', 'player1');
room.addPlayer('player1', 'Игрок 1');
room.addPlayer('player2', 'Игрок 2');
console.log(`   Игроков в комнате: ${room.players.length}`);
console.log(`   Статус: ${room.state}`);

// Тест 2: Старт игры
console.log('\n✅ Тест 2: Старт игры');
room.setReady('player1');
room.setReady('player2');
const gameState = room.startGame();
console.log(`   Статус: ${room.state}`);
console.log(`   Козырь: ${room.trump}`);
console.log(`   Карт в колоде: ${room.deck.length}`);
console.log(`   Карт у игрока 1: ${room.players[0].hand.length}`);
console.log(`   Карт у игрока 2: ${room.players[1].hand.length}`);
console.log(`   Атакующий: ${room.players[room.attacker].username}`);
console.log(`   Защищающийся: ${room.players[room.defender].username}`);

// Тест 3: Атака
console.log('\n✅ Тест 3: Атака');
const attackCard = room.players[room.attacker].hand[0];
console.log(`   Атака картой: ${attackCard.rank}${attackCard.suit}`);
const attackResult = room.attack(room.players[room.attacker].id, attackCard);
if (attackResult.error) {
  console.log(`   ❌ Ошибка: ${attackResult.error}`);
} else {
  console.log(`   ✓ Атака успешна`);
  console.log(`   Карт на столе: ${room.table.length}`);
}

// Тест 4: AI логика
console.log('\n✅ Тест 4: AI решение');
const aiPlayer = new AIPlayer(room);
const decision = aiPlayer.makeDecision(room.players[room.defender].id);
if (decision) {
  console.log(`   AI решение: ${decision.action}`);
  if (decision.action === 'defend') {
    console.log(`   Защита картой: ${decision.defenseCard.rank}${decision.defenseCard.suit}`);
    console.log(`   От карты: ${decision.attackCard.rank}${decision.attackCard.suit}`);
  }
} else {
  console.log(`   AI не может принять решение`);
}

// Тест 5: Проверка добавления карт
console.log('\n✅ Тест 5: Добавление карт (подкидывание)');
if (room.table.length > 0) {
  const tableRank = room.table[0].card.rank;
  const matchingCard = room.players[room.attacker].hand.find(c => c.rank === tableRank);
  if (matchingCard) {
    console.log(`   Пытаемся подкинуть: ${matchingCard.rank}${matchingCard.suit}`);
    const canAdd = room.canAddToAttack(matchingCard);
    console.log(`   Можно подкинуть: ${canAdd ? 'Да' : 'Нет'}`);
  } else {
    console.log(`   Нет карт подходящего ранга для подкидывания`);
  }
}

// Тест 6: Проверка валидации
console.log('\n✅ Тест 6: Валидация неправильных ходов');
const wrongPlayerAttack = room.attack(room.players[room.defender].id, room.players[room.defender].hand[0]);
console.log(`   Атака не своего хода: ${wrongPlayerAttack.error ? '✓ Заблокировано' : '❌ Не заблокировано'}`);

// Тест 7: Проверка окончания раунда
console.log('\n✅ Тест 7: Логика окончания раунда');
const attacks = room.table.filter(t => t.type === 'attack');
const defenses = room.table.filter(t => t.type === 'defense');
console.log(`   Атак на столе: ${attacks.length}`);
console.log(`   Защит на столе: ${defenses.length}`);
console.log(`   Все отбито: ${attacks.length === defenses.length ? 'Да' : 'Нет'}`);

console.log('\n🎉 Все тесты выполнены!\n');
