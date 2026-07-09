// =====================================================
// SOUND & HAPTIC SYSTEM
// =====================================================

const Sound = (() => {
  let ctx = null;
  let enabled = true;
  let hapticEnabled = true;

  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return ctx;
  }

  function play(type) {
    if (!enabled) return;
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    switch(type) {
      case 'card_play': synth(c, 800, 0.06, 'sine', 0.3); haptic(10); break;
      case 'card_defend': synth(c, 1200, 0.08, 'sine', 0.25); haptic([10, 30, 10]); break;
      case 'take_cards': synth(c, 300, 0.15, 'triangle', 0.2); haptic([20, 50, 20]); break;
      case 'pass': synth(c, 500, 0.05, 'sine', 0.15); haptic(5); break;
      case 'error': synth(c, 200, 0.2, 'sawtooth', 0.15); haptic([30, 50, 30, 50, 30]); break;
      case 'win': playMelody(c, [523, 659, 784, 1047], 0.12, 0.2); haptic([50, 100, 50, 100, 50]); break;
      case 'lose': playMelody(c, [400, 350, 300, 250], 0.15, 0.15); haptic([80, 80, 80, 80]); break;
      case 'deal': synth(c, 600 + Math.random() * 400, 0.03, 'sine', 0.1); haptic(3); break;
      case 'shuffle': for(let i=0;i<5;i++) setTimeout(()=>synth(c, 400+i*100, 0.02, 'sine', 0.08), i*30); break;
      case 'turn': synth(c, 700, 0.08, 'sine', 0.15); haptic(8); break;
      case 'button': synth(c, 900, 0.04, 'sine', 0.1); break;
    }
  }

  function synth(c, freq, dur, type, vol) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + dur);
  }

  function playMelody(c, notes, noteDur, vol) {
    notes.forEach((f, i) => setTimeout(() => synth(c, f, noteDur, 'sine', vol), i * noteDur * 1000));
  }

  function haptic(pattern) {
    if (!hapticEnabled || !navigator.vibrate) return;
    navigator.vibrate(pattern);
  }

  function toggle() { enabled = !enabled; return enabled; }
  function toggleHaptic() { hapticEnabled = !hapticEnabled; return hapticEnabled; }
  function isEnabled() { return enabled; }
  function isHapticEnabled() { return hapticEnabled; }

  return { play, haptic, toggle, toggleHaptic, isEnabled, isHapticEnabled };
})();
