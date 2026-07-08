// =====================================================
// ANIMATION SYSTEM - Beautiful Card Animations
// =====================================================

const Animations = (() => {
  const SUIT_SYMBOLS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };

  function injectStyles() {
    if (document.getElementById('durak-animations-css')) return;
    const style = document.createElement('style');
    style.id = 'durak-animations-css';
    style.textContent = `
      .shuffle-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(15, 15, 26, 0.97);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        transition: opacity 0.6s ease-out;
      }
      .shuffle-stage {
        position: relative; width: 200px; height: 280px;
        perspective: 800px;
      }
      .shuffle-card {
        position: absolute; width: 80px; height: 112px;
        background: linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%);
        border: 2px solid #d0d0d0; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 36px; color: #2c3e50;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .shuffle-card:nth-child(1) { color: #c0392b; z-index: 5; }
      .shuffle-card:nth-child(2) { color: #c0392b; z-index: 4; }
      .shuffle-card:nth-child(3) { color: #2c3e50; z-index: 3; }
      .shuffle-card:nth-child(4) { color: #2c3e50; z-index: 2; }
      .shuffle-card:nth-child(5) { z-index: 1; background: linear-gradient(135deg, #1a1a2e, #16213e); color: #7c5ce7; border-color: #7c5ce7; font-size: 28px; font-weight: 900; }

      .shuffle-text {
        margin-top: 40px; font-size: 20px; font-weight: 700;
        color: var(--text-primary); letter-spacing: 1px;
      }
      .shuffle-subtext {
        margin-top: 8px; font-size: 14px; color: var(--text-muted);
      }
      .shuffle-progress {
        margin-top: 24px; width: 200px; height: 4px;
        background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;
      }
      .shuffle-progress-bar {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, var(--accent), var(--blue), var(--green));
        border-radius: 2px; transition: width 0.1s linear;
      }

      @keyframes confettiFall {
        0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
      .confetti {
        position: fixed; width: 10px; height: 10px;
        border-radius: 2px; z-index: 99999; pointer-events: none;
        animation: confettiFall 3s ease-in forwards;
      }

      @keyframes particleBurst {
        0% { transform: translate(0,0) scale(1); opacity: 1; }
        100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
      }
      .success-particle {
        position: fixed; width: 8px; height: 8px; border-radius: 50%;
        background: var(--green); pointer-events: none; z-index: 99999;
        animation: particleBurst 0.8s ease-out forwards;
      }

      @keyframes cardDealIn {
        0% { transform: translateY(-200px) rotate(-20deg) scale(0.5); opacity: 0; }
        100% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
      }
      .animate-deal {
        animation: cardDealIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes shakeAnim {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }
      .shake { animation: shakeAnim 0.4s ease-out; }

      @keyframes flipAnim {
        0% { transform: rotateY(0deg); }
        50% { transform: rotateY(90deg); }
        100% { transform: rotateY(0deg); }
      }
      .flip { animation: flipAnim 0.5s ease-in-out; }

      @keyframes slideToTable {
        0% { transform: translateY(100px) scale(0.8); opacity: 0; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }
      .slide-to-table { animation: slideToTable 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }

      @keyframes glowPulse {
        0%, 100% { box-shadow: 0 0 20px var(--accent); }
        50% { box-shadow: 0 0 40px var(--accent), 0 0 60px var(--accent); }
      }

      @keyframes cardAppear {
        0% { transform: scale(0) rotate(-10deg); opacity: 0; }
        100% { transform: scale(1) rotate(0); opacity: 1; }
      }

      @keyframes slideUp {
        0% { transform: translateY(30px); opacity: 0; }
        100% { transform: translateY(0); opacity: 1; }
      }

      @keyframes bounceIn {
        0% { transform: scale(0.3); opacity: 0; }
        50% { transform: scale(1.1); }
        70% { transform: scale(0.9); }
        100% { transform: scale(1); opacity: 1; }
      }

      @keyframes defenderGlow {
        0%, 100% { box-shadow: 0 0 10px rgba(255,107,107,0.3); }
        50% { box-shadow: 0 0 25px rgba(255,107,107,0.6); }
      }

      @keyframes attackerGlow {
        0%, 100% { box-shadow: 0 0 10px rgba(124,92,231,0.3); }
        50% { box-shadow: 0 0 25px rgba(124,92,231,0.6); }
      }

      @keyframes takeCardsShake {
        0%, 100% { transform: translateX(0) rotate(0); }
        25% { transform: translateX(-3px) rotate(-1deg); }
        75% { transform: translateX(3px) rotate(1deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function showShuffleAnimation(duration = 2500) {
    injectStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'shuffle-overlay';

      const stage = document.createElement('div');
      stage.className = 'shuffle-stage';

      const suits = ['♥', '♦', '♣', '♠', '🃏'];
      const cards = suits.map((s, i) => {
        const c = document.createElement('div');
        c.className = 'shuffle-card';
        c.textContent = s;
        c.style.transform = `translate(-50%, -50%) rotate(${(i - 2) * 5}deg) translateY(${(i - 2) * 8}px)`;
        return c;
      });
      cards.forEach(c => stage.appendChild(c));

      const text = document.createElement('div');
      text.className = 'shuffle-text';
      text.textContent = 'Перемешивание карт...';

      const subtext = document.createElement('div');
      subtext.className = 'shuffle-subtext';
      subtext.textContent = 'Приготовьтесь к игре';

      const progress = document.createElement('div');
      progress.className = 'shuffle-progress';
      const bar = document.createElement('div');
      bar.className = 'shuffle-progress-bar';
      progress.appendChild(bar);

      overlay.appendChild(stage);
      overlay.appendChild(text);
      overlay.appendChild(subtext);
      overlay.appendChild(progress);
      document.body.appendChild(overlay);

      let step = 0;
      const totalSteps = 8;
      const stepDuration = duration / totalSteps;

      function shuffleStep() {
        if (step >= totalSteps) {
          bar.style.width = '100%';
          setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.remove(); resolve(); }, 600);
          }, 300);
          return;
        }

        bar.style.width = ((step + 1) / totalSteps * 100) + '%';

        const leftIdx = step % 2 === 0 ? 0 : 1;
        const rightIdx = step % 2 === 0 ? 1 : 0;
        const offset = step % 4 < 2 ? 1 : -1;

        cards.forEach((c, i) => {
          if (i === leftIdx) {
            c.style.transform = `translate(calc(-50% + ${offset * 40}px), -50%) rotate(${offset * 15}deg)`;
          } else if (i === rightIdx) {
            c.style.transform = `translate(calc(-50% - ${offset * 40}px), -50%) rotate(${-offset * 15}deg)`;
          } else {
            c.style.transform = `translate(-50%, -50%) rotate(${(i - 2) * 3}deg) translateY(${(i - 2) * 2}px)`;
          }
        });

        step++;
        setTimeout(shuffleStep, stepDuration);
      }

      setTimeout(shuffleStep, 200);
    });
  }

  function animateCardDeal(cardElement, delay = 0) {
    if (!cardElement) return;
    cardElement.classList.add('animate-deal');
    cardElement.style.animationDelay = `${delay}s`;
    setTimeout(() => cardElement.classList.remove('animate-deal'), 500 + delay * 1000);
  }

  function animateCardToTable(cardElement, callback) {
    if (!cardElement) return;
    cardElement.classList.add('slide-to-table');
    setTimeout(() => { if (callback) callback(); }, 500);
  }

  function shakeElement(element) {
    if (!element) return;
    element.classList.add('shake');
    navigator.vibrate?.([50, 100, 50]);
    setTimeout(() => element.classList.remove('shake'), 500);
  }

  function createSuccessParticles(x, y, count = 12) {
    injectStyles();
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'success-particle';
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';
      particle.style.setProperty('--tx', `${(Math.random() - 0.5) * 160}px`);
      particle.style.setProperty('--ty', `${-Math.random() * 120 - 30}px`);
      particle.style.animationDelay = `${i * 0.04}s`;
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 1000);
    }
    navigator.vibrate?.(80);
  }

  function createConfetti(count = 40) {
    injectStyles();
    const colors = ['#7c5ce7', '#4facfe', '#00d4aa', '#ffd93d', '#ff6b6b', '#fff'];
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * window.innerWidth + 'px';
        c.style.top = '-10px';
        c.style.background = colors[Math.floor(Math.random() * colors.length)];
        c.style.animationDuration = (2 + Math.random() * 2) + 's';
        c.style.width = (6 + Math.random() * 8) + 'px';
        c.style.height = (6 + Math.random() * 8) + 'px';
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 5000);
      }, i * 40);
    }
  }

  function highlightPlayableCards(cards, playableIndices) {
    cards.forEach((card, index) => {
      if (playableIndices.includes(index)) {
        card.classList.add('playable');
      } else {
        card.classList.remove('playable');
      }
    });
  }

  function flipCard(cardElement, callback) {
    if (!cardElement) return;
    cardElement.classList.add('flip');
    setTimeout(() => { if (callback) callback(); }, 300);
    setTimeout(() => cardElement.classList.remove('flip'), 600);
  }

  function pulseElement(element, duration = 2000) {
    if (!element) return;
    element.style.animation = `glowPulse ${duration}ms ease-in-out`;
    setTimeout(() => { element.style.animation = ''; }, duration);
  }

  function fadeIn(element, duration = 300) {
    if (!element) return;
    element.style.opacity = '0';
    element.style.transition = `opacity ${duration}ms ease-out`;
    setTimeout(() => { element.style.opacity = '1'; }, 10);
  }

  function fadeOut(element, duration = 300) {
    return new Promise((resolve) => {
      if (!element) { resolve(); return; }
      element.style.transition = `opacity ${duration}ms ease-out`;
      element.style.opacity = '0';
      setTimeout(() => resolve(), duration);
    });
  }

  function scaleBounce(element) {
    if (!element) return;
    element.style.transition = 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    element.style.transform = 'scale(1.2)';
    setTimeout(() => { element.style.transform = 'scale(1)'; }, 200);
  }

  function addGlowEffect(element, color = 'var(--accent)') {
    if (!element) return;
    const orig = element.style.boxShadow;
    element.style.transition = 'box-shadow 0.3s ease-out';
    element.style.boxShadow = `0 0 30px ${color}, 0 0 50px ${color}`;
    setTimeout(() => { element.style.boxShadow = orig; }, 1000);
  }

  function animateTakeCards(tableCards) {
    if (!tableCards) return;
    tableCards.forEach((card, i) => {
      setTimeout(() => {
        card.style.transition = 'all 0.3s ease-in';
        card.style.transform = 'scale(0.5) translateY(100px)';
        card.style.opacity = '0';
      }, i * 60);
    });
  }

  function animateNewRound(callback) {
    const tableCards = document.querySelectorAll('.table-pair');
    if (tableCards.length === 0) { if (callback) callback(); return; }
    animateTakeCards(tableCards);
    setTimeout(() => { if (callback) callback(); }, tableCards.length * 60 + 300);
  }

  function flashAttacker(element) {
    if (!element) return;
    element.style.animation = 'attackerGlow 1.5s ease-in-out 2';
    setTimeout(() => { element.style.animation = ''; }, 3000);
  }

  function flashDefender(element) {
    if (!element) return;
    element.style.animation = 'defenderGlow 1.5s ease-in-out 2';
    setTimeout(() => { element.style.animation = ''; }, 3000);
  }

  return {
    showShuffleAnimation,
    animateCardDeal,
    animateCardToTable,
    shakeElement,
    createSuccessParticles,
    createConfetti,
    highlightPlayableCards,
    flipCard,
    pulseElement,
    fadeIn,
    fadeOut,
    scaleBounce,
    addGlowEffect,
    animateTakeCards,
    animateNewRound,
    flashAttacker,
    flashDefender
  };
})();
