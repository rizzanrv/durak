(() => {
  const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };

  let currentUser = null, socket = null, currentRoom = null;
  let selectedCard = null, gameState = null, myHand = [];
  let i18nData = {}, currentLang = localStorage.getItem('lang') || 'ru';
  let dragCard = null, currentFriendToPlay = null;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  async function loadI18n() { try { i18nData = await (await fetch('/i18n.json')).json(); } catch(e) { i18nData = {}; } }
  function t(k, p) { let s = i18nData[currentLang]?.[k] || i18nData['en']?.[k] || k; if(p) Object.entries(p).forEach(([k,v]) => s = s.replace(`{${k}}`, v)); return s; }
  function applyI18n() {
    $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
    $$('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
    const lb = $('#btn-lang'); if(lb) lb.textContent = t('lang_switch');
    document.documentElement.lang = currentLang === 'ru' ? 'ru' : 'en';
  }
  function switchLang() { currentLang = currentLang === 'en' ? 'ru' : 'en'; localStorage.setItem('lang', currentLang); applyI18n(); }

  function showScreen(id) { $$('.screen').forEach(s => s.classList.remove('active')); $(`#${id}`).classList.add('active'); }
  function showToast(msg, type='error') { 
    const c = $('#toast-container'); const t = document.createElement('div'); 
    t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t); 
    if (type === 'error') Sound.play('error');
    setTimeout(() => t.remove(), 3000); 
  }

  function api(method, path, body) {
    const token = localStorage.getItem('token');
    const opts = { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(`/api${path}`, opts).then(r => r.json());
  }

  function initAuth() {
    $('#show-register').onclick = e => { e.preventDefault(); $('#login-form').classList.remove('active'); $('#register-form').classList.add('active'); };
    $('#show-login').onclick = e => { e.preventDefault(); $('#register-form').classList.remove('active'); $('#login-form').classList.add('active'); };
    $('#btn-login').onclick = async () => {
      const login = $('#login-login').value.trim(), password = $('#login-password').value;
      if (!login || !password) return showToast(t('fill_fields'));
      const d = await api('POST', '/auth/login', { login, password });
      if (d.error) return showToast(d.error);
      localStorage.setItem('token', d.token); currentUser = d.user; enterApp();
    };
    $('#btn-register').onclick = async () => {
      const username = $('#reg-username').value.trim(), email = $('#reg-email').value.trim(), password = $('#reg-password').value;
      if (!username || !email || !password) return showToast(t('fill_fields'));
      const d = await api('POST', '/auth/register', { username, email, password });
      if (d.error) return showToast(d.error);
      localStorage.setItem('token', d.token); currentUser = d.user; enterApp();
    };
    ['#login-login','#login-password'].forEach(s => $(s).onkeydown = e => { if(e.key==='Enter') $('#btn-login').click(); });
    ['#reg-username','#reg-email','#reg-password'].forEach(s => $(s).onkeydown = e => { if(e.key==='Enter') $('#btn-register').click(); });
  }

  async function checkSession() {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try { const d = await api('GET', '/auth/me'); if (d.user) { currentUser = d.user; return true; } } catch(e) {}
    localStorage.removeItem('token'); return false;
  }

  function enterApp() { showScreen('main-screen'); updateUserUI(); initNavigation(); initFriends(); connectSocket(); loadRooms(); }

  function updateUserUI() {
    if (!currentUser) return;
    const c = currentUser.avatarColor || '#6C5CE7';
    const emoji = currentUser.avatarEmoji || '😎';
    const photo = currentUser.avatarPhoto;

    const setAvatar = (el, size) => {
      if (photo) {
        el.style.background = `url(${photo}) center/cover`;
        el.textContent = '';
      } else {
        el.style.background = c;
        el.textContent = emoji;
      }
    };

    setAvatar($('#header-avatar'));
    setAvatar($('#profile-avatar'));

    $('#header-username').textContent = currentUser.username;
    $('#header-rating').textContent = `${currentUser.rating} ${t('rating')}`;
    $('#profile-username').textContent = currentUser.username;
    $('#profile-bio').value = currentUser.bio || '';
    $('#stat-rating').textContent = currentUser.rating;
    $('#stat-games').textContent = currentUser.gamesPlayed;
    $('#stat-wins').textContent = currentUser.gamesWon;

    const emojis = ['😎','🃏','♠️','♥️','♦️','♣️','🏆','👑','🎯','🔥','💀','🤖','🐱','🐶','🦊','🐼','🦁','🐸','🎮','🎲'];
    const picker = $('#avatar-picker');
    if (picker && !picker.dataset.init) {
      picker.dataset.init = '1';
      emojis.forEach(e => {
        const btn = document.createElement('button');
        btn.textContent = e;
        btn.style.cssText = 'width:36px;height:36px;font-size:20px;border:2px solid var(--border);border-radius:8px;background:var(--bg-tertiary);cursor:pointer;display:flex;align-items:center;justify-content:center;';
        btn.onclick = () => {
          currentUser.avatarEmoji = e;
          currentUser.avatarPhoto = null;
          $('#profile-avatar').style.background = c;
          $('#profile-avatar').textContent = e;
          picker.style.display = 'none';
        };
        picker.appendChild(btn);
      });
    }

    const uploadBtn = $('#btn-upload-photo');
    const fileInput = $('#avatar-upload');
    if (uploadBtn && fileInput && !uploadBtn.dataset.init) {
      uploadBtn.dataset.init = '1';
      uploadBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { showToast('Max 2MB', 'error'); return; }
        const fd = new FormData();
        fd.append('avatar', file);
        try {
          const res = await fetch('/api/auth/avatar', {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: fd
          });
          const d = await res.json();
          if (d.user) {
            currentUser = d.user;
            const av = $('#profile-avatar');
            av.style.background = `url(${d.user.avatarPhoto}) center/cover`;
            av.textContent = '';
            $('#header-avatar').style.background = `url(${d.user.avatarPhoto}) center/cover`;
            $('#header-avatar').textContent = '';
            picker.style.display = 'none';
            showToast(t('save'), 'success');
          }
        } catch(e) { showToast('Upload error', 'error'); }
      };
    }

    $('#btn-save-profile').onclick = async () => {
      const bio = $('#profile-bio').value.trim();
      const d = await api('PUT', '/auth/profile', { avatar_emoji: currentUser.avatarEmoji, bio });
      if (d.user) { currentUser = d.user; updateUserUI(); showToast(t('save'), 'success'); }
    };
  }

  function initNavigation() {
    $$('.nav-item').forEach(btn => btn.onclick = () => {
      $$('.nav-item').forEach(b => b.classList.remove('active')); btn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active')); $(`#tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'friends') loadFriends();
    });
    $('#btn-logout').onclick = async () => { await api('POST', '/auth/logout'); localStorage.removeItem('token'); currentUser = null; if(socket) socket.disconnect(); showScreen('auth-screen'); };
    $('#btn-settings').onclick = () => { $$('.nav-item').forEach(b => b.classList.remove('active')); $$('.tab-panel').forEach(p => p.classList.remove('active')); $$('.nav-item')[3].classList.add('active'); $('#tab-profile').classList.add('active'); };
  }

  function connectSocket() {
    socket = io({ transports: ['websocket', 'polling'] });
    const token = localStorage.getItem('token');
    socket.emit('authenticate', token);
    socket.on('connect', () => {
      socket.emit('authenticate', token);
      const savedRoom = localStorage.getItem('currentRoom');
      const savedGame = localStorage.getItem('gameState');
      if (savedRoom && savedGame && token) {
        socket.emit('reconnect_game', { roomId: savedRoom });
      }
    });
    socket.on('reconnect_success', s => {
      gameState = s;
      currentRoom = localStorage.getItem('currentRoom');
      enterGame(s);
    });
    socket.on('reconnect_fail', () => {
      localStorage.removeItem('currentRoom');
      localStorage.removeItem('gameState');
    });
    socket.on('room_created', r => { currentRoom = r.id; localStorage.setItem('currentRoom', r.id); showLobby(r); });
    socket.on('room_joined', r => { currentRoom = r.id; localStorage.setItem('currentRoom', r.id); showLobby(r); });
    socket.on('room_updated', r => updateLobby(r));
    socket.on('rooms_updated', r => updateRoomList(r));
    socket.on('game_started', s => { gameState = s; enterGame(s); });
    socket.on('game_state', s => {
      const prevState = gameState;
      gameState = s;
      if (prevState && prevState.table.length > s.table.length && s.table.length === 0) {
        if (typeof Animations !== 'undefined') {
          Animations.animateNewRound(() => updateGame(s));
          return;
        }
      }
      updateGame(s);
    });
    socket.on('game_over', d => {
      if (typeof Animations !== 'undefined') Animations.createConfetti(60);
      showGameOver(d);
    });
    socket.on('error', d => showToast(d.message));
    socket.on('game_invite', d => showInviteModal(d));
    socket.on('online_users', u => updateOnlineStatus(u));
    socket.on('training_hint', h => showTrainingHint(h));
    socket.on('ai_thinking', d => showAIThinking(d));
    socket.on('kicked_from_room', () => {
      currentRoom = null;
      gameState = null;
      localStorage.removeItem('currentRoom');
      localStorage.removeItem('gameState');
      $('#lobby-view').style.display = 'none';
      showScreen('main-screen');
      showToast(t('kicked_from_room') || 'Вы удалены из комнаты', 'error');
    });
  }

  function showTrainingHint(hint) {
    const hintEl = $('#training-hint');
    $('#hint-advice').textContent = hint.advice || '';
    $('#hint-explanation').textContent = hint.explanation || '';
    hintEl.style.display = 'block';
    setTimeout(() => {
      hintEl.style.display = 'none';
    }, 8000);
  }

  function showAIThinking(data) {
    if (!data.hint) return;
    showToast(`${data.playerName}: ${data.hint.advice}`, 'info');
  }

  function showInviteModal(data) {
    const modal = $('#invite-modal');
    modal.style.display = 'flex';
    $('#invite-message').textContent = `${data.from} invites you to a game`;
    $('#btn-invite-accept').onclick = () => { modal.style.display = 'none'; socket.emit('join_room', { roomId: data.roomId }); };
    $('#btn-invite-reject').onclick = () => { modal.style.display = 'none'; };
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Durak', { body: `${data.from} invites you to a game`, icon: '/img/icon-192.svg', tag: 'invite' }); } catch(e) {}
    }
  }

  let currentModeSettings = null;
  
  function initGameModes() {
    
    $$('.mode-card').forEach(card => card.onclick = () => {
      const mode = card.dataset.mode;
      
      if (mode === 'vs_ai') {
        // Показываем настройки для игры с ИИ
        currentModeSettings = { mode: 'classic', vsAI: true, isTraining: false };
        showGameSettings(currentModeSettings);
      } else if (mode === 'training') {
        // Режим обучения
        currentModeSettings = { mode: 'classic', vsAI: true, isTraining: true };
        showGameSettings(currentModeSettings);
      } else if (mode === 'friends') {
        // Игра с друзьями - показываем настройки
        currentModeSettings = { mode: 'classic', vsAI: false, isTraining: false };
        showGameSettings(currentModeSettings);
      } else if (mode === 'custom') {
        showRoomList();
      } else {
        // Быстрая игра без настроек
        socket.emit('create_room', { mode, settings: {} });
      }
    });
    
    $('#btn-cancel-settings').onclick = () => {
      $('#game-settings-modal').style.display = 'none';
      currentModeSettings = null;
    };
    
    $('#btn-confirm-settings').onclick = () => {
      if (!currentModeSettings) return;
      
      const settings = {
        gameType: $('#setting-game-type').value,
        deckSize: parseInt($('#setting-deck-size').value),
        maxPlayers: parseInt($('#setting-max-players').value),
        turnTime: parseInt($('#setting-turn-time').value),
        aiDifficulty: $('#setting-ai-difficulty').value,
        isTraining: currentModeSettings.isTraining || false
      };
      
      $('#game-settings-modal').style.display = 'none';
      
      socket.emit('create_room', { mode: currentModeSettings.mode, settings });
      
      // Если игра с ИИ, добавляем ИИ после создания комнаты
      if (currentModeSettings.vsAI) {
        setTimeout(() => {
          socket.emit('add_ai', { difficulty: settings.aiDifficulty });
        }, 500);
      }
      
      // Если игра с другом, приглашаем его
      if (currentModeSettings.withFriend) {
        setTimeout(() => {
          socket.emit('invite_friend', { friendId: currentModeSettings.withFriend });
          showToast(`Приглашение отправлено ${currentModeSettings.withFriend}`, 'success');
        }, 500);
      }
      
      currentModeSettings = null;
      currentFriendToPlay = null;
    };
    
    $('#btn-back-lobby').onclick = () => { socket.emit('leave_room'); $('#lobby-view').style.display = 'none'; currentRoom = null; };
    $('#btn-ready').onclick = () => { socket.emit('player_ready'); $('#btn-ready').disabled = true; $('#btn-ready').textContent = t('ready_bang'); };
    $('#btn-add-ai').onclick = showAIDifficultyModal;
    $('#btn-add-ai').onclick = showAIDifficultyModal;
    $('#btn-start').onclick = () => socket.emit('start_game');
    $('#btn-invite-friend').onclick = showInviteFriendsModal;
    $('#btn-close-invite').onclick = () => { $('#invite-friends-modal').style.display = 'none'; };
  }

  function showGameSettings(modeSettings) {
    const modal = $('#game-settings-modal');
    const aiGroup = $('#ai-difficulty-group');
    
    // Показываем/скрываем выбор сложности ИИ
    if (modeSettings.vsAI) {
      aiGroup.style.display = 'block';
    } else {
      aiGroup.style.display = 'none';
    }
    
    // Если обучение, показываем соответствующие настройки
    if (modeSettings.isTraining) {
      $('#setting-max-players').value = '2';
      $('#setting-max-players').disabled = true;
    } else {
      $('#setting-max-players').disabled = false;
    }
    
    modal.style.display = 'flex';
  }

  function showGameSettingsForFriend(friendName) {
    currentModeSettings = { mode: 'classic', vsAI: false, isTraining: false, withFriend: friendName };
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    $$('.nav-item')[0].classList.add('active');
    $('#tab-play').classList.add('active');
    showGameSettings(currentModeSettings);
  }

  function showAIDifficultyModal() {
    const difficulty = prompt(t('ai_difficulty') + ':\n1. ' + t('difficulty_easy') + '\n2. ' + t('difficulty_medium') + '\n3. ' + t('difficulty_hard'), '2');
    const diffMap = { '1': 'easy', '2': 'medium', '3': 'hard' };
    socket.emit('add_ai', { difficulty: diffMap[difficulty] || 'medium' });
  }

  function showInviteFriendsModal() {
    const modal = $('#invite-friends-modal');
    const list = $('#invite-friends-list');
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px;">Loading friends...</div>';
    modal.style.display = 'flex';
    api('GET', '/friends').then(d => {
      list.innerHTML = '';
      if (!d.friends || d.friends.length === 0) { list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px;">No friends to invite</div>'; return; }
      d.friends.forEach(f => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
          <div class="friend-avatar" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}</div>
          <div class="friend-info"><div class="friend-name">${f.username}</div></div>
          <button class="btn-invite" data-user="${f.username}">${t('invite')}</button>
        `;
        list.appendChild(div);
      });
      list.querySelectorAll('.btn-invite').forEach(btn => btn.onclick = () => {
        socket.emit('invite_friend', { friendId: btn.dataset.user });
        showToast(t('inv_sent'), 'success');
        btn.textContent = t('sent'); btn.disabled = true;
      });
    });
  }

  function showLobby(room) {
    const l = $('#lobby-view'); l.style.display = 'flex'; l.style.position = 'fixed'; l.style.inset = '0';
    const mn = { classic: t('classic'), transfer: t('transfer'), custom: t('custom') };
    $('#lobby-title').textContent = mn[room.mode] || room.mode;
    updateLobby(room);
  }

  function updateLobby(room) {
    const c = $('#lobby-players'); c.innerHTML = '';
    const h = document.createElement('div'); h.className = 'friend-section-title';
    h.textContent = `${t('players')} (${room.players.length}/${room.maxPlayers})`; c.appendChild(h);
    
    // Показываем настройки комнаты
    if (room.settings) {
      const settingsDiv = document.createElement('div');
      settingsDiv.style.cssText = 'padding:12px 16px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:16px;font-size:13px;color:var(--text-secondary);';
      const gameTypeText = room.settings.gameType === 'perevodnoy' ? t('perevodnoy') : t('podkidnoy');
      const turnTimeText = room.settings.turnTime === 0 ? t('unlimited') : `${room.settings.turnTime} ${t('seconds')}`;
      settingsDiv.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>${t('game_type')}:</span><strong style="color:var(--text-primary);">${gameTypeText}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>${t('deck_size')}:</span><strong style="color:var(--text-primary);">${room.settings.deckSize} ${t('deck_size').toLowerCase()}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>${t('turn_time')}:</span><strong style="color:var(--text-primary);">${turnTimeText}</strong>
        </div>
        ${room.settings.isTraining ? `<div style="margin-top:8px;padding:8px;background:rgba(253,203,110,0.15);border-radius:6px;color:var(--yellow);font-weight:600;text-align:center;">${t('training_mode')}</div>` : ''}
      `;
      c.appendChild(settingsDiv);
    }
    
    room.players.forEach(p => {
      const d = document.createElement('div'); d.className = `lobby-player ${p.isReady ? 'ready' : ''}`;
      const isCreator = room.creatorId === currentUser.id;
      const isMe = p.id === currentUser.id;
      const isAI = String(p.id).startsWith('ai_');
      const kickBtn = (isCreator && !isMe && !isAI) 
        ? `<button class="btn-kick" data-id="${p.id}" style="padding:4px 10px;border-radius:8px;border:1px solid var(--red);background:var(--red-dim);color:var(--red);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">✕</button>` 
        : '';
      d.innerHTML = `<div class="friend-avatar" style="background:${isAI?'#E17055':'#6C5CE7'};width:36px;height:36px;font-size:13px;">${p.username[0].toUpperCase()}</div><span class="lobby-player-name">${p.username}${isMe?' (You)':''}</span>${p.isReady?`<span class="lobby-player-status">${t('ready_bang')}</span>`:`<span style="color:var(--text-muted);font-size:11px;">${t('not_ready')}</span>`}${kickBtn}`;
      c.appendChild(d);
    });
    c.querySelectorAll('.btn-kick').forEach(b => b.onclick = () => {
      socket.emit('kick_player', { playerId: b.dataset.id });
    });
    if (room.players.length < room.maxPlayers) { const e = document.createElement('div'); e.className = 'lobby-player'; e.innerHTML = `<span style="color:var(--text-muted);font-size:13px;">${t('waiting')}</span>`; c.appendChild(e); }
    $('#btn-start').style.display = (room.players.some(p => p.id === currentUser.id) && room.players.length >= 2) ? 'block' : 'none';
  }

  function showRoomList() { $('#room-list').style.display = 'block'; loadRooms(); }
  async function loadRooms() { try { const d = await api('GET', '/rooms'); updateRoomList(d.rooms || []); } catch(e) {} }
  function updateRoomList(rooms) {
    const c = $('#rooms-container'); c.innerHTML = '';
    if (!rooms.length) { c.innerHTML = `<div class="empty-state"><p>${t('no_open_rooms')}</p></div>`; return; }
    rooms.forEach(r => { const d = document.createElement('div'); d.className = 'room-card'; d.innerHTML = `<div class="room-info"><h4>${r.mode}</h4><p>${new Date(r.createdAt).toLocaleTimeString()}</p></div><span class="room-players-count">${r.players.length}/${r.maxPlayers}</span>`; d.onclick = () => socket.emit('join_room', { roomId: r.id }); c.appendChild(d); });
  }

  function enterGame(state) { 
    showScreen('game-screen'); 
    selectedCard = null; 
    setupDragDrop(); 
    localStorage.setItem('gameState', JSON.stringify({ state: 'playing' }));
    
    if (state.settings && state.settings.isTraining) {
      $('#btn-hint').style.display = 'inline-block';
      $('#btn-hint').onclick = () => socket.emit('get_hint');
    } else {
      $('#btn-hint').style.display = 'none';
    }
    
    if (typeof Animations !== 'undefined') {
      Animations.showShuffleAnimation(2000).then(() => {
        updateGame(state);
        Animations.createConfetti(15);
      });
    } else {
      updateGame(state);
    }
  }

  function setupDragDrop() {
    const tableArea = $('#table-area');
    
    // Desktop drag & drop
    tableArea.ondragover = e => { e.preventDefault(); tableArea.classList.add('drag-over'); };
    tableArea.ondragleave = () => tableArea.classList.remove('drag-over');
    tableArea.ondrop = e => {
      e.preventDefault();
      tableArea.classList.remove('drag-over');
      if (dragCard) { playCard(dragCard); dragCard = null; }
    };
    
    // Mobile touch handling - improved
    let touchStartTime = 0;
    let touchMoved = false;
    
    tableArea.addEventListener('touchstart', (e) => {
      touchStartTime = Date.now();
      touchMoved = false;
    }, { passive: true });
    
    tableArea.addEventListener('touchmove', () => {
      touchMoved = true;
    }, { passive: true });
    
    tableArea.addEventListener('touchend', (e) => {
      if (e.target.closest('#table-actions') || e.target.closest('#training-hint')) {
        return;
      }
      const touchDuration = Date.now() - touchStartTime;
      if (!touchMoved && touchDuration < 300) {
        e.preventDefault();
      }
    });
  }

  function updateGame(state) {
    const mp = state.players.find(p => p.id === currentUser.id);
    myHand = mp ? sortHand(mp.hand, state.trump) : [];

    const td = $('#trump-display');
    if (state.trump) {
      const sym = SUIT_SYMBOLS[state.trump];
      td.className = `trump-display ${state.trump}`;
      const badgeSuit = $('#trump-badge-suit');
      if (badgeSuit) badgeSuit.textContent = sym;
    }

    const trumpFace = $('#trump-card-face');
    if (trumpFace && state.faceUpTrump && state.deckCount > 0) {
      trumpFace.style.display = 'flex';
      trumpFace.className = `trump-card-face ${state.trump}`;
      $('#trump-card-rank').textContent = state.faceUpTrump.rank;
      $('#trump-card-suit').textContent = SUIT_SYMBOLS[state.trump];
    } else if (trumpFace) {
      trumpFace.style.display = 'none';
    }

    $('#deck-count-text').textContent = state.deckCount;
    const modeNames = { classic: 'Classic', transfer: 'Transfer' };
    let modeText = modeNames[state.mode] || state.mode;
    
    // Показываем таймер если есть ограничение
    if (state.turnTimeRemaining !== null && state.turnTimeRemaining !== undefined && state.settings && state.settings.turnTime > 0) {
      modeText += ` • ${state.turnTimeRemaining}s`;
    }
    
    $('#game-mode-label').textContent = modeText;

    updateOpponents(state);
    updateTable(state);
    updateHand(state);
    updateTurnIndicator(state);

    if (mp) {
      const c = currentUser.avatarColor||'#6C5CE7';
      $('#game-player-avatar').textContent = currentUser.username[0].toUpperCase();
      $('#game-player-avatar').style.background = c;
      $('#game-player-name').innerHTML = `${currentUser.username} <span class="hand-count-badge">${mp.handCount}</span>`;
    }
    updateActions(state);
  }

  function updateTurnIndicator(state) {
    const mp = state.players.find(p => p.id === currentUser.id);
    const myIdx = state.players.indexOf(mp);
    const isAttacker = state.attacker === myIdx;
    const isDefender = state.defender === myIdx;
    const attackerName = state.players[state.attacker]?.username || '?';
    const defenderName = state.players[state.defender]?.username || '?';

    let hint = '';
    if (isAttacker && state.isAttackerTurn) {
      hint = state.table.length > 0 ? t('turn_your_attack_add') : t('turn_your_attack');
    } else if (isDefender && state.isDefenderTurn) {
      hint = t('turn_defend');
    } else {
      hint = t('turn_waits', { attacker: attackerName, defender: defenderName });
    }

    const existing = document.getElementById('turn-hint');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'turn-hint';
    el.style.cssText = 'text-align:center;font-size:12px;color:var(--text-secondary);padding:4px 8px;';
    if (isAttacker && state.isAttackerTurn) el.style.color = 'var(--accent)';
    if (isDefender && state.isDefenderTurn) el.style.color = 'var(--red)';
    el.textContent = hint;
    const ta = $('#table-area');
    if (ta && ta.firstChild) ta.insertBefore(el, ta.firstChild);
  }

  function updateOpponents(state) {
    const c = $('#opponents-area'); c.innerHTML = '';
    state.players.forEach((p, i) => {
      if (p.id === currentUser.id) return;
      const d = document.createElement('div'); d.className = 'opponent-card';
      if (state.attacker === i) d.classList.add('active-turn');
      if (state.defender === i) d.classList.add('is-defender');
      d.style.animation = 'cardAppear 0.3s ease-out';
      const role = state.attacker === i ? 'ATK' : state.defender === i ? 'DEF' : '';
      const roleColor = state.attacker === i ? 'var(--accent)' : state.defender === i ? 'var(--red)' : 'var(--text-muted)';
      const emoji = p.avatarEmoji || '😎';
      const color = String(p.id).startsWith('ai_') ? '#E17055' : (p.avatarColor || '#6C5CE7');
      const photo = p.avatarPhoto;
      const avatarStyle = photo
        ? `background:url(${photo}) center/cover;`
        : `background:${color};`;
      d.innerHTML = `<div class="friend-avatar" style="${avatarStyle}width:36px;height:36px;margin:0 auto 2px;font-size:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;" data-user-id="${p.id}">${photo ? '' : emoji}</div><div class="opponent-name">${p.username}</div><div style="font-size:9px;font-weight:700;color:${roleColor};margin-bottom:2px;">${role}</div><div class="opponent-cards"><span class="card-count-icon">${SUIT_SYMBOLS[state.trump] || '?'}</span> <span class="card-count-num">${p.handCount}</span></div>`;
      c.appendChild(d);
      const avatarEl = d.querySelector('.friend-avatar');
      if (avatarEl && !String(p.id).startsWith('ai_')) {
        avatarEl.onclick = () => showUserProfile(p.id);
      }
    });
  }

  function updateTable(state) {
    const c = $('#table-cards'); c.innerHTML = '';
    const pairs = []; let ca = null;
    state.table.forEach(e => { if(e.type==='attack') ca=e; else if(e.type==='defense'&&ca) { pairs.push({attack:ca,defense:e}); ca=null; } });
    if (ca) pairs.push({attack:ca,defense:null});
    pairs.forEach(p => {
      const pd = document.createElement('div'); pd.className = 'table-pair';
      const atkCard = createCardEl(p.attack.card,false,true);
      atkCard.style.position = 'relative';
      pd.appendChild(atkCard);
      if(p.defense) {
        const defCard = createCardEl(p.defense.card,false,true);
        defCard.style.position = 'relative';
        defCard.style.marginTop = '-10px';
        pd.appendChild(defCard);
      }
      c.appendChild(pd);
    });
    if (!state.table.length) { const h = document.createElement('div'); h.className = 'table-hint'; h.textContent = t('table_empty'); c.appendChild(h); }
  }

  function sortHand(hand, trump) {
    const suitOrder = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
    return [...hand].sort((a, b) => {
      if (a.suit === trump && b.suit !== trump) return 1;
      if (a.suit !== trump && b.suit === trump) return -1;
      if (a.suit === b.suit) return a.value - b.value;
      return (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0);
    });
  }

  function updateHand(state) {
    const c = $('#player-hand'); c.innerHTML = '';
    const mp = state.players.find(p => p.id === currentUser.id);
    if (!mp) return;
    const myIdx = state.players.indexOf(mp);
    const isAttacker = state.attacker === myIdx;
    const isDefender = state.defender === myIdx;
    
    const sortedHand = sortHand(myHand, state.trump);
    const handCount = sortedHand.length;
    c.classList.remove('overlap', 'tight', 'ultra');
    if (handCount > 12) c.classList.add('ultra');
    else if (handCount > 10) c.classList.add('tight');
    else if (handCount > 8) c.classList.add('overlap');

    sortedHand.forEach(card => {
      const el = createCardEl(card, true);
      if (selectedCard && selectedCard.suit===card.suit && selectedCard.rank===card.rank) el.classList.add('selected');
      
      let isPlayable = false;
      if (state.throwInProgress && state.throwInBy === myIdx && myIdx !== state.defender) {
        const tableRanks = new Set(state.table.map(t => t.card.rank));
        isPlayable = tableRanks.size === 0 || tableRanks.has(card.rank);
      } else if (isDefender && state.isDefenderTurn) {
        const attacks = state.table.filter(t => t.type === 'attack');
        const defenses = state.table.filter(t => t.type === 'defense');
        for (const atk of attacks) {
          const hasDefense = defenses.some(def => 
            def.beats && def.beats.suit === atk.card.suit && def.beats.rank === atk.card.rank
          );
          if (!hasDefense && canBeatCard(card, atk.card, state.trump)) {
            isPlayable = true;
            break;
          }
        }
      } else if (isAttacker && state.isAttackerTurn) {
        if (state.table.length === 0) {
          isPlayable = true;
        } else {
          const tableRanks = new Set(state.table.map(t => t.card.rank));
          isPlayable = tableRanks.has(card.rank);
        }
      }
      
      if (isPlayable) {
        el.style.cursor = 'pointer';
        el.style.border = '2px solid rgba(var(--accent-rgb, 108, 92, 231), 0.5)';
      } else if ((isAttacker && state.isAttackerTurn) || (isDefender && state.isDefenderTurn)) {
        el.style.opacity = '0.5';
        el.style.cursor = 'not-allowed';
      }
      
      el.onclick = () => playCard(card);
      
      // Desktop drag
      el.ondragstart = e => { 
        dragCard = card; 
        el.classList.add('dragging'); 
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.rank + card.suit); 
      };
      el.ondragend = () => { 
        el.classList.remove('dragging'); 
        dragCard = null; 
      };
      
      // Mobile touch - improved with visual feedback
      let touchStartY = 0, touchStartX = 0, cloned = null;
      let touchStartTime = 0;
      let hasMoved = false;
      
      el.ontouchstart = e => { 
        touchStartX = e.touches[0].clientX; 
        touchStartY = e.touches[0].clientY; 
        touchStartTime = Date.now();
        hasMoved = false;
        cloned = null;
      };
      
      el.ontouchmove = e => {
        const dy = e.touches[0].clientY - touchStartY;
        const dx = e.touches[0].clientX - touchStartX;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 15 && !cloned) {
          hasMoved = true;
        }
        
        if (Math.abs(dy) > 30 && !cloned) {
          hasMoved = true;
          cloned = el.cloneNode(true);
          cloned.style.position = 'fixed';
          cloned.style.pointerEvents = 'none';
          cloned.style.zIndex = '9999';
          cloned.style.opacity = '0.9';
          cloned.style.transform = 'scale(1.1)';
          cloned.style.boxShadow = '0 16px 40px rgba(0,0,0,0.5)';
          document.body.appendChild(cloned);
          el.style.opacity = '0.3';
          navigator.vibrate?.(30);
        }
        
        if (cloned) {
          cloned.style.left = (e.touches[0].clientX - 36) + 'px';
          cloned.style.top = (e.touches[0].clientY - 54) + 'px';
          e.preventDefault();
        }
      };
      
      el.ontouchend = e => {
        el.classList.remove('touch-active');
        el.style.opacity = '1';
        
        if (cloned) {
          cloned.remove(); 
          const touch = e.changedTouches[0];
          const tableRect = $('#table-area').getBoundingClientRect();
          
          if (touch.clientY < tableRect.bottom + 20) {
            playCard(card);
            navigator.vibrate?.(50);
          }
        } else if (!hasMoved) {
          playCard(card);
        }
        
        cloned = null;
      };
      
      el.ontouchcancel = () => {
        el.classList.remove('touch-active');
        if (cloned) {
          cloned.remove();
          el.style.opacity = '1';
        }
        cloned = null;
      };
      
      c.appendChild(el);
    });
  }

  function updateActions(state) {
    const a = $('#table-actions');
    const mp = state.players.find(p => p.id === currentUser.id);
    if (!mp) return;
    const myIdx = state.players.indexOf(mp);
    const isAttacker = state.attacker === myIdx;
    const isDefender = state.defender === myIdx;

    a.innerHTML = '';
    
    if (isDefender && state.isDefenderTurn) {
      // Кнопка "Взять"
      const takeBtn = document.createElement('button');
      takeBtn.className = 'btn-take'; takeBtn.textContent = t('take');
      takeBtn.onclick = () => { socket.emit('take_cards'); selectedCard = null; Sound.play('take_cards'); };
      a.appendChild(takeBtn);
      
      // Кнопка "Перевести" для переводного дурака
      if (state.settings && state.settings.gameType === 'perevodnoy' && state.table.length === 1) {
        const transferBtn = document.createElement('button');
        transferBtn.className = 'btn btn-secondary'; 
        transferBtn.textContent = t('transfer');
        transferBtn.style.cssText = 'width:auto;padding:10px 20px;font-size:14px;margin-left:8px;';
        transferBtn.onclick = () => {
          if (selectedCard) {
            socket.emit('transfer', { card: selectedCard });
            selectedCard = null;
          } else {
            showToast(t('select_transfer'), 'error');
          }
        };
        a.appendChild(transferBtn);
      }
    } else if (isAttacker && state.isAttackerTurn && state.table.length > 0) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary'; btn.textContent = t('pass');
      btn.style.cssText = 'width:auto;padding:10px 28px;font-size:14px;';
      btn.onclick = () => { socket.emit('end_round'); selectedCard = null; Sound.play('pass'); };
      a.appendChild(btn);
    }

    if (state.throwInProgress && state.throwInBy !== undefined) {
      const myIdx = state.players.findIndex(p => p.id === currentUser.id);
      if (state.throwInBy === myIdx && myIdx !== state.defender) {
        const passBtn = document.createElement('button');
        passBtn.className = 'btn btn-secondary';
        passBtn.textContent = t('pass');
        passBtn.style.cssText = 'width:auto;padding:10px 28px;font-size:14px;';
        passBtn.onclick = () => { socket.emit('pass_throw_in'); };
        a.appendChild(passBtn);
      }
    }

    if (state.deckCount > 0 && state.faceUpTrump) {
      const hasTrump6 = myHand.some(c => c.suit === state.trump && c.rank === '6');
      if (hasTrump6) {
        const exBtn = document.createElement('button');
        exBtn.className = 'btn btn-secondary';
        exBtn.textContent = '6→' + SUIT_SYMBOLS[state.trump];
        exBtn.style.cssText = 'width:auto;padding:10px 16px;font-size:13px;background:var(--yellow-dim);color:var(--yellow);border-color:var(--yellow);';
        exBtn.onclick = () => { socket.emit('exchange_trump6'); };
        a.appendChild(exBtn);
      }
    }

    a.style.display = a.children.length > 0 ? 'flex' : 'none';
  }

  function createCardEl(card, interactive=false, small=false) {
    const d = document.createElement('div');
    const cls = [small?'card-small':'card', card.suit];
    if (card.suit === gameState?.trump) cls.push('trump');
    d.className = cls.join(' ');
    const suitSym = SUIT_SYMBOLS[card.suit];
    d.innerHTML = `
      <div class="card-corner">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-small">${suitSym}</span>
      </div>
      <div class="card-center">${suitSym}</div>
      <div class="card-corner" style="align-self:flex-end;transform:rotate(180deg);">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit-small">${suitSym}</span>
      </div>`;
    return d;
  }

  function playCard(card) {
    if (!gameState) return;
    const mp = gameState.players.find(p => p.id === currentUser.id);
    if (!mp) return;
    const myIdx = gameState.players.indexOf(mp);

    const hasCard = mp.hand.some(c => c.suit === card.suit && c.rank === card.rank);
    if (!hasCard) {
      showToast(t('no_card'), 'error');
      return;
    }

    if (gameState.throwInProgress && gameState.throwInBy === myIdx && myIdx !== gameState.defender) {
      const tableRanks = new Set(gameState.table.map(t => t.card.rank));
      if (tableRanks.size > 0 && !tableRanks.has(card.rank)) {
        showToast(t('cant_add_rank'), 'error');
        return;
      }
      socket.emit('throw_in', { card });
      selectedCard = null;
      Sound.play('card_play');
      return;
    }
    
    // Защита
    if (gameState.defender === myIdx && gameState.isDefenderTurn) {
      const attacks = gameState.table.filter(t => t.type === 'attack');
      const defenses = gameState.table.filter(t => t.type === 'defense');
      
      // Найти первую незащищённую атаку
      let attackToDefend = null;
      for (const atk of attacks) {
        const hasDefense = defenses.some(def => 
          def.beats && def.beats.suit === atk.card.suit && def.beats.rank === atk.card.rank
        );
        if (!hasDefense) {
          attackToDefend = atk.card;
          break;
        }
      }
      
      if (!attackToDefend) {
        showToast(t('all_defended'), 'error');
        return;
      }
      
      // Проверка что картой можно бить
      if (!canBeatCard(card, attackToDefend, gameState.trump)) {
        showToast(t('cant_beat_attack'), 'error');
        return;
      }
      
      socket.emit('defend', { attackCard: attackToDefend, defenseCard: card });
      selectedCard = null;
      Sound.play('card_defend');
    } 
    // Атака
    else if (gameState.attacker === myIdx && gameState.isAttackerTurn) {
      // Проверка что карту можно подкинуть
      if (gameState.table.length > 0) {
        const tableRanks = new Set(gameState.table.map(t => t.card.rank));
        if (!tableRanks.has(card.rank)) {
          showToast(t('cant_add_rank'), 'error');
          return;
        }
      }
      
      socket.emit('attack', { card });
      selectedCard = null;
      Sound.play('card_play');
    } else {
      // Если защищающийся, но не его ход - сохраняем выбор для кнопки "Перевести"
      if (gameState.defender === myIdx && gameState.settings && gameState.settings.gameType === 'perevodnoy') {
        selectedCard = card;
        updateHand(gameState);
        return;
      }
      showToast(t('not_your_turn'), 'error');
    }
  }

  // Вспомогательная функция проверки битья карты
  function canBeatCard(card, target, trump) {
    if (card.suit === target.suit) {
      const rankValues = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
      return rankValues[card.rank] > rankValues[target.rank];
    }
    if (card.suit === trump && target.suit !== trump) {
      return true;
    }
    return false;
  }

  function initGameActions() {
    $('#btn-take').onclick = () => { socket.emit('take_cards'); selectedCard = null; };
    $('#btn-game-menu').onclick = showGameMenu;
  }

  function showGameMenu() {
    const o = document.createElement('div'); o.className = 'game-menu-overlay';
    const soundOn = Sound.isEnabled();
    const hapticOn = Sound.isHapticEnabled();
    o.innerHTML = `<div class="game-menu"><h3>${t('game_menu')}</h3><button class="game-menu-item" id="menu-resume"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>${t('resume')}</button><button class="game-menu-item" id="menu-sound"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>${t('sound')}: ${soundOn ? 'ON' : 'OFF'}</button><button class="game-menu-item" id="menu-haptic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>${t('haptic')}: ${hapticOn ? 'ON' : 'OFF'}</button><button class="game-menu-item danger" id="menu-quit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>${t('quit_game')}</button></div>`;
    document.body.appendChild(o);
    o.onclick = e => { if(e.target===o) o.remove(); };
    o.querySelector('#menu-resume').onclick = () => o.remove();
    o.querySelector('#menu-sound').onclick = () => {
      const on = Sound.toggle();
      o.querySelector('#menu-sound').innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>${t('sound')}: ${on ? 'ON' : 'OFF'}`;
      if (on) Sound.play('button');
    };
    o.querySelector('#menu-haptic').onclick = () => {
      const on = Sound.toggleHaptic();
      o.querySelector('#menu-haptic').innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>${t('haptic')}: ${on ? 'ON' : 'OFF'}`;
      if (on) Sound.haptic(30);
    };
    o.querySelector('#menu-quit').onclick = () => { o.remove(); socket.emit('leave_room'); currentRoom=null; gameState=null; showScreen('main-screen'); };
  }

  async function showUserProfile(userId) {
    try {
      const d = await api('GET', `/auth/profile/${userId}`);
      if (d.error) return showToast(d.error, 'error');
      const u = d.user;
      const m = document.createElement('div');
      m.className = 'modal';
      m.style.zIndex = '10001';
      const winRate = u.gamesPlayed > 0 ? Math.round(u.gamesWon / u.gamesPlayed * 100) : 0;
      const avatarHTML = u.avatarPhoto
        ? `<div style="width:72px;height:72px;border-radius:50%;background:url(${u.avatarPhoto}) center/cover;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;box-shadow:0 4px 16px rgba(0,0,0,0.3);border:3px solid ${u.avatarColor || '#6C5CE7'};"></div>`
        : `<div style="width:72px;height:72px;border-radius:50%;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 12px;box-shadow:0 4px 16px rgba(0,0,0,0.3);">${u.avatarEmoji}</div>`;
      m.innerHTML = `<div class="modal-content" style="max-width:320px;">
        <div style="text-align:center;margin-bottom:20px;">
          ${avatarHTML}
          <h2 style="font-size:20px;font-weight:800;margin-bottom:4px;">${u.username}</h2>
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">${u.bio || ''}</p>
        </div>
        <div style="display:flex;justify-content:space-around;margin-bottom:20px;padding:16px;background:var(--bg-secondary);border-radius:var(--radius-sm);">
          <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--yellow);">${u.rating}</div><div style="font-size:11px;color:var(--text-muted);">${t('rating')}</div></div>
          <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--accent);">${u.gamesPlayed}</div><div style="font-size:11px;color:var(--text-muted);">${t('games')}</div></div>
          <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--green);">${winRate}%</div><div style="font-size:11px;color:var(--text-muted);">Winrate</div></div>
        </div>
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" style="width:100%;">OK</button>
      </div>`;
      m.onclick = e => { if(e.target === m) m.remove(); };
      document.body.appendChild(m);
    } catch(e) {}
  }

  function showGameOver(data) {
    localStorage.removeItem('currentRoom');
    localStorage.removeItem('gameState');
    const m = $('#game-over-modal'); m.style.display = 'flex';
    const w = data.winner===currentUser.id, d = data.durak===currentUser.id;
    if (w) Sound.play('win'); else Sound.play('lose');
    $('#game-over-icon').innerHTML = w ? '<svg width="56" height="56" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="28" stroke="#00B894" stroke-width="3"/><path d="M20 32l8 8 16-16" stroke="#00B894" stroke-width="3" fill="none"/></svg>' : '<svg width="56" height="56" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="28" stroke="#E17055" stroke-width="3"/><path d="M22 22l20 20M42 22l-20 20" stroke="#E17055" stroke-width="3"/></svg>';
    $('#game-over-title').textContent = w ? t('victory') : d ? t('durak_title') : t('defeat');
    $('#game-over-title').style.color = w ? 'var(--green)' : 'var(--red)';
    $('#game-over-message').textContent = d ? t('you_durak') : w ? t('congrats') : t('better_luck');
    $('#btn-play-again').onclick = () => { m.style.display='none'; showScreen('main-screen'); };
    $('#btn-to-lobby').onclick = () => { m.style.display='none'; showScreen('main-screen'); };
  }

  // FRIENDS
  async function loadFriends() {
    try {
      const d = await api('GET', '/friends');
      renderReceived(d.received || []);
      renderSent(d.sent || []);
      renderFriendsList(d.friends || []);
    } catch(e) {}
  }

  function renderReceived(list) {
    const c = $('#friend-received'); c.innerHTML = '';
    if (!list.length) return;
    const h = document.createElement('div'); h.className = 'friend-section-title';
    h.textContent = `${t('friend_requests')} (${list.length})`; c.appendChild(h);
    list.forEach(f => {
      const d = document.createElement('div'); d.className = 'friend-item';
      d.innerHTML = `<div class="friend-avatar" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}</div><div class="friend-info"><div class="friend-name">${f.username}</div><div class="friend-rating">${f.rating} ${t('rating')}</div></div><div class="friend-actions"><button class="btn-accept" data-id="${f.id}">${t('accept')}</button><button class="btn-reject" data-id="${f.id}">${t('reject')}</button></div>`;
      c.appendChild(d);
    });
    c.querySelectorAll('.btn-accept').forEach(b => b.onclick = async () => { await api('POST', '/friends/accept', { userId: parseInt(b.dataset.id) }); loadFriends(); });
    c.querySelectorAll('.btn-reject').forEach(b => b.onclick = async () => { await api('POST', '/friends/reject', { userId: parseInt(b.dataset.id) }); loadFriends(); });
  }

  function renderSent(list) {
    const c = $('#friend-sent'); c.innerHTML = '';
    if (!list.length) return;
    const h = document.createElement('div'); h.className = 'friend-section-title';
    h.textContent = `${t('sent')} (${list.length})`; c.appendChild(h);
    list.forEach(f => {
      const d = document.createElement('div'); d.className = 'friend-item';
      d.innerHTML = `<div class="friend-avatar" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}</div><div class="friend-info"><div class="friend-name">${f.username}</div><div class="friend-rating">${f.rating} ${t('rating')}</div></div><div class="friend-actions"><button class="btn-sent">${t('sent')}</button></div>`;
      c.appendChild(d);
    });
  }

  function renderFriendsList(list) {
    const c = $('#friends-list'); c.innerHTML = '';
    const h = document.createElement('div'); h.className = 'friend-section-title';
    h.textContent = `${t('friends_list')} (${list.length})`; c.appendChild(h);
    if (!list.length) { c.innerHTML += `<div class="empty-state"><p>${t('no_friends')}</p></div>`; return; }
    list.forEach(f => {
      const d = document.createElement('div'); d.className = 'friend-item';
      const isOnline = onlineUsers.some(u => u.username === f.username);
      const actionButtons = currentRoom 
        ? `<button class="btn-invite" data-friend="${f.username}">${t('invite')}</button>`
        : `<button class="btn-play-friend" data-friend="${f.username}" data-friend-id="${f.id}">🎮 ${t('play')}</button>`;
      d.innerHTML = `<div class="friend-avatar" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}${isOnline?'<div class="online-dot"></div>':''}</div><div class="friend-info"><div class="friend-name">${f.username}</div><div class="friend-rating">${f.rating} ${t('rating')}</div></div><div class="friend-actions">${actionButtons}<button class="btn-remove" data-id="${f.id}">${t('remove')}</button></div>`;
      c.appendChild(d);
    });
    c.querySelectorAll('.btn-play-friend').forEach(b => b.onclick = () => {
      const friendName = b.dataset.friend;
      currentFriendToPlay = friendName;
      showGameSettingsForFriend(friendName);
    });
    c.querySelectorAll('.btn-invite').forEach(b => b.onclick = () => { socket.emit('invite_friend', { friendId: b.dataset.friend }); showToast(t('inv_sent'), 'success'); });
    c.querySelectorAll('.btn-remove').forEach(b => b.onclick = async () => { await api('DELETE', `/friends/${b.dataset.id}`); loadFriends(); });
  }

  let onlineUsers = [];
  function updateOnlineStatus(u) { onlineUsers = u; loadFriends(); }

  async function handleSearch(e) {
    const q = e.target.value.trim(), c = $('#search-results');
    if (q.length < 2) { c.innerHTML = ''; return; }
    try {
      const d = await api('GET', `/friends/search?q=${encodeURIComponent(q)}`);
      c.innerHTML = '';
      const h = document.createElement('div'); h.className = 'friend-section-title'; h.textContent = t('search_results'); c.appendChild(h);
      if (!d.users.length) { c.innerHTML += `<div class="empty-state"><p>${t('no_players')}</p></div>`; return; }
      d.users.forEach(u => {
        const div = document.createElement('div'); div.className = 'friend-item';
        let btnHtml = '';
        if (u.friendship === 'accepted') btnHtml = `<button class="btn-already">${t('friends_list')}</button>`;
        else if (u.friendship === 'pending') btnHtml = `<button class="btn-sent">${t('sent')}</button>`;
        else btnHtml = `<button class="btn-invite" data-username="${u.username}">${t('add')}</button>`;
        div.innerHTML = `<div class="friend-avatar" style="background:${u.avatar_color}">${u.username[0].toUpperCase()}</div><div class="friend-info"><div class="friend-name">${u.username}</div><div class="friend-rating">${u.rating} ${t('rating')}</div></div><div class="friend-actions">${btnHtml}</div>`;
        c.appendChild(div);
      });
      c.querySelectorAll('.btn-invite[data-username]').forEach(b => b.onclick = async () => {
        const r = await api('POST', '/friends/request', { username: b.dataset.username });
        if (r.error) return showToast(r.error);
        showToast(t('request_sent'), 'success'); b.textContent = t('sent'); b.className = 'btn-sent';
      });
    } catch(e) {}
  }

  async function initFriends() {
    $('#friend-search').addEventListener('input', debounce(handleSearch, 300));
    loadFriends();
  }

  async function loadHistory() { $('#history-list').innerHTML = `<div class="empty-state"><p>Game history will appear here</p></div>`; }

  function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this,a), ms); }; }

  async function init() {
    await loadI18n(); applyI18n();
    if ('Notification' in window && Notification.permission === 'default') { Notification.requestPermission(); }
    $('#btn-lang').onclick = switchLang;
    initAuth(); initGameModes(); initGameActions();
    $('#friend-search').addEventListener('input', debounce(handleSearch, 300));
    if (await checkSession()) enterApp(); else showScreen('auth-screen');
    setTimeout(() => { const s = $('#splash-screen'); s.style.opacity='0'; s.style.transition='opacity 0.5s ease'; setTimeout(()=>{s.classList.remove('active');s.style.display='none';},500); }, 2000);
  }

  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
  document.addEventListener('DOMContentLoaded', init);
})();
