// Game state
let currentGame = null;
let selectedCard = null;

// Suit symbols
const suitSymbols = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

function initGame(data) {
  currentGame = data;
  selectedCard = null;
  
  // Находим свою руку
  const myPlayer = data.players.find(p => p.userId === currentUser.id);
  if (myPlayer) {
    currentGame.myHand = myPlayer.hand;
  }
  
  renderGame();
}

function updateGameState(state) {
  if (!currentGame) return;
  
  // Обновляем состояние игры
  if (state.myHand) {
    currentGame.myHand = state.myHand;
  }
  currentGame.gameState = state;
  
  renderGame();
  
  if (state.winner) {
    setTimeout(() => {
      const isWinner = state.winner.userId === currentUser.id;
      alert(isWinner ? 'Вы победили!' : 'Вы проиграли');
      backToMenu();
    }, 1000);
  }
}

function renderGame() {
  if (!currentGame) return;

  const state = currentGame.gameState || {};
  
  // Update opponent info
  const opponent = currentGame.players.find(p => p.userId !== currentUser.id);
  if (opponent) {
    document.getElementById('opponentName').textContent = opponent.username;
    document.getElementById('opponentCards').textContent = state.opponentHandSize || opponent.hand?.length || 6;
  }

  // Update deck and trump
  if (state.trump || currentGame.gameState?.trump) {
    document.getElementById('deckCount').textContent = state.deckSize || 24;
    renderCard(state.trump || currentGame.gameState.trump, document.getElementById('trumpCard'));
  }

  // Render table
  renderTable(state.table || []);

  // Render player hand
  renderPlayerHand();

  // Update action buttons
  updateActionButtons(state);
}

function renderCard(card, element) {
  if (!card) {
    element.innerHTML = '';
    return;
  }

  const suitSymbol = suitSymbols[card.suit];
  const suitClass = (card.suit === 'hearts' || card.suit === 'diamonds') ? 'hearts' : 'clubs';
  
  element.innerHTML = `
    <div class="card-rank">${card.rank}</div>
    <div class="card-suit ${suitClass}">${suitSymbol}</div>
  `;
}

function renderTable(table) {
  const tableEl = document.getElementById('gameTable');
  
  if (!table || table.length === 0) {
    tableEl.innerHTML = '<p style="color: var(--text-secondary);">Стол пуст</p>';
    return;
  }

  tableEl.innerHTML = table.map((pair, index) => {
    const attackCard = createCardElement(pair.attack, null, false);
    const defendCard = pair.defend ? createCardElement(pair.defend, null, false) : '<div style="width: 70px; height: 100px;"></div>';
    
    return `
      <div class="card-pair" data-index="${index}">
        ${attackCard}
        ${defendCard}
      </div>
    `;
  }).join('');
}

function renderPlayerHand() {
  if (!currentGame) return;

  const myHand = currentGame.myHand || [];
  const handEl = document.getElementById('playerHand');
  
  if (myHand.length === 0) {
    handEl.innerHTML = '<p style="color: #b0b0b0;">Нет карт</p>';
    return;
  }
  
  handEl.innerHTML = myHand.map((card, index) => 
    createCardElement(card, index, true)
  ).join('');
}

function createCardElement(card, index, isClickable) {
  const suitSymbol = suitSymbols[card.suit];
  const suitClass = (card.suit === 'hearts' || card.suit === 'diamonds') ? 'hearts' : 'clubs';
  const selectedClass = selectedCard === index ? 'selected' : '';
  const onclick = isClickable ? `onclick="selectCard(${index})"` : '';
  
  return `
    <div class="card ${selectedClass}" ${onclick}>
      <div class="card-rank">${card.rank}</div>
      <div class="card-suit ${suitClass}">${suitSymbol}</div>
    </div>
  `;
}

function selectCard(index) {
  if (!currentGame) return;

  const state = currentGame.gameState;
  const isMyTurn = (state.phase === 'attack' && state.currentAttacker === currentUser.id) ||
                   (state.phase === 'defend' && state.currentDefender === currentUser.id);

  if (!isMyTurn) {
    alert('Не ваш ход');
    return;
  }

  if (selectedCard === index) {
    selectedCard = null;
  } else {
    selectedCard = index;
    
    if (state.phase === 'attack') {
      playAttackCard(index);
    } else if (state.phase === 'defend') {
      // Need to select which card to defend
      if (state.table.some(pair => !pair.defend)) {
        const tableIndex = state.table.findIndex(pair => !pair.defend);
        defendWithCard(index, tableIndex);
      }
    }
  }

  renderPlayerHand();
}

function playAttackCard(cardIndex) {
  if (!socket || !currentGame) return;

  socket.emit('playCard', {
    cardIndex,
    targetIndex: null
  });

  selectedCard = null;
}

function defendWithCard(cardIndex, tableIndex) {
  if (!socket || !currentGame) return;

  socket.emit('defendCard', {
    cardIndex,
    tableIndex
  });

  selectedCard = null;
}

function takeCards() {
  if (!socket || !currentGame) return;

  const state = currentGame.gameState;
  if (state.currentDefender !== currentUser.id) {
    alert('Только защищающийся может взять карты');
    return;
  }

  socket.emit('takeCards');
  selectedCard = null;
}

function pass() {
  if (!socket || !currentGame) return;

  const state = currentGame.gameState;
  if (state.phase !== 'continue') {
    alert('Можно пасовать только после отбития всех карт');
    return;
  }

  socket.emit('pass');
  selectedCard = null;
}

function updateActionButtons(state) {
  const takeBtn = document.getElementById('takeBtn');
  const passBtn = document.getElementById('passBtn');

  const isDefender = state.currentDefender === currentUser.id;
  const isAttacker = state.currentAttacker === currentUser.id;

  takeBtn.disabled = !isDefender || state.phase === 'continue';
  passBtn.disabled = state.phase !== 'continue' || !isAttacker;
}

// Touch handling for better mobile experience
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;
  
  // Swipe detection for future use
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
    // Horizontal swipe
  }
});
