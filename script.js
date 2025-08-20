/* jshint esversion: 8, browser: true, devel: true */
/* global DOMMatrixReadOnly */

// Cleaned & consolidated script.js
// - Moved utilities earlier so they're available to all functions
// - Consolidated duplicate handlers (paw/noBtn)
// - Added guards for missing DOM elements
// - ES8 async/await usage allowed via jshint header

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* -----------------
     Utilities / small helpers
     ----------------- */
  function showToast(text, ms = 1200) {
    try {
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerText = text;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), ms + 200);
    } catch (e) {
      // silent
      console.warn('showToast failed', e);
    }
  }

  function shadeColor(hex, percent) {
    const c = String(hex).replace('#', '');
    const num = parseInt(c, 16);
    const r = Math.max(0, (num >> 16) + percent);
    const g = Math.max(0, ((num >> 8) & 0x00FF) + percent);
    const b = Math.max(0, (num & 0x0000FF) + percent);
    return (
      '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
    );
  }



  /* =========================
     Audio setup & caching
     ========================= */
  let audioCtx = null;
  let rizzAudioElem = null;
  let rizzSource = null;
  let rizzBuffer = null;
  const RIZZ_URL = 'assets/audio/rizz-sound-effect.mp3';
  let replayRemaining = 1;

  async function initAndPlayRizzOnce() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        try {
          await audioCtx.resume();
        } catch (e) {
          /* ignore resume errors */
        }
      }

      // play from cached buffer
      if (rizzBuffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = rizzBuffer;
        src.connect(audioCtx.destination);
        src.start();
        return;
      }

      // fetch + decode
      try {
        const resp = await fetch(RIZZ_URL + '?_=' + Date.now(), { mode: 'cors' });
        if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
        const ab = await resp.arrayBuffer();
        rizzBuffer = await audioCtx.decodeAudioData(ab);
        const src = audioCtx.createBufferSource();
        src.buffer = rizzBuffer;
        src.connect(audioCtx.destination);
        src.start();
        return;
      } catch (fetchErr) {
        console.warn('fetch/decode failed, falling back to media element', fetchErr);
      }

      // fallback to media element
      try {
        if (!rizzAudioElem) {
          rizzAudioElem = new Audio(RIZZ_URL);
          rizzAudioElem.crossOrigin = 'anonymous';
          rizzAudioElem.preload = 'auto';
        }
        try {
          if (!rizzSource && audioCtx && rizzAudioElem) {
            rizzSource = audioCtx.createMediaElementSource(rizzAudioElem);
            rizzSource.connect(audioCtx.destination);
          }
        } catch (e) {
          /* ignore createMediaElementSource errors (CORS) */
        }
        await rizzAudioElem.play();
        return;
      } catch (elemErr) {
        console.warn('media element fallback failed', elemErr);
      }

      // final best-effort
      try {
        (new Audio(RIZZ_URL)).play().catch(() => {});
      } catch (e) {
        console.warn('final fallback failed', e);
      }
    } catch (err) {
      console.error('initAndPlayRizzOnce overall error', err);
    }
  }

  /* =========================
     UI elements & sliding stack
     ========================= */
  const stack = document.getElementById('stack');
  const yesBtn = document.getElementById('yesBtn');
  const noBtn = document.getElementById('noBtn');
  const replayAudioBtn = document.getElementById('replayAudioBtn');
  const secretEgg = document.getElementById('secretEgg');
  const backUpBtn = document.getElementById('backUpBtn');
  const collectedEl = document.getElementById('collected');
  const elapsedEl = document.getElementById('elapsed');
  const gameField = document.getElementById('gameCanvasWrap');

  function slideTo(step) {
    if (!stack) return;
    const y = -step * window.innerHeight;
    stack.style.transform = `translateY(${y}px)`;
    if (backUpBtn) {
      if (step === 2) backUpBtn.classList.remove('hidden');
      else backUpBtn.classList.add('hidden');
    }
  }

  /* ========== Buttons behavior ========== */
  let yesScale = 1;
  let noOffset = 0;
  if (noBtn) {
    noBtn.addEventListener('click', (e) => {
      // movement/visual
      yesScale = Math.min(yesScale + 0.22, 4);
      if (yesBtn) yesBtn.style.transform = `scale(${yesScale})`;

      noOffset += 12;
      noBtn.style.transition = 'transform 160ms ease';
      noBtn.style.transform = `translateX(-${noOffset}px) rotate(-6deg)`;
      setTimeout(() => { if (noBtn) noBtn.style.transform = `translateX(-${noOffset}px)`; }, 140);

      // optional sound with element id "no-sound"
      const noSound = document.getElementById('no-sound');
      if (noSound && typeof noSound.play === 'function') {
        try { noSound.currentTime = 0; noSound.play(); } catch (err) { /* ignore */ }
      }

      // prevent default only if this is an anchor
      if (e && e.preventDefault && (noBtn.tagName || '').toLowerCase() === 'a') e.preventDefault();
    });
  }

  if (yesBtn) {
    yesBtn.addEventListener('click', async () => {
      try { updateRizz(100, 'Yes senpai'); } catch (e) { console.warn('updateRizz failed but continuing', e); }
      try { await initAndPlayRizzOnce().catch((e) => { console.warn('rizz audio failed:', e); }); }
      finally { slideTo(1); spawnFloatingHearts(); }
    });
  }

  if (replayAudioBtn) {
    replayAudioBtn.addEventListener('click', async () => {
      if (replayRemaining <= 0) return;
      await initAndPlayRizzOnce().catch(() => {});
      replayRemaining--;
      replayAudioBtn.textContent = `🔊 Play again (${replayRemaining})`;
      if (replayRemaining <= 0) replayAudioBtn.disabled = true;
    });
  }

  /* ========== Floating hearts (click to go to game) ========== */
  let floatInterval = null;
  function spawnFloatingHearts() {
    if (floatInterval) return;
    floatInterval = setInterval(() => {
      const h = document.createElement('div');
      h.className = 'heart-floating';
      h.textContent = ['❤️','💖','💕','💘','💞','💓'][Math.floor(Math.random() * 6)];
      h.style.left = (6 + Math.random() * 82) + 'vw';
      h.style.setProperty('--dur', (3 + Math.random() * 2.5) + 's');
      h.addEventListener('click', (ev) => {
        ev.stopPropagation();
        smallBeep();
        cleanupFloatingHearts();
        slideTo(2);
        startCatchGame();
      });
      document.body.appendChild(h);
      setTimeout(() => { if (h.parentElement) h.remove(); }, 7000);
    }, 520);

    setTimeout(() => { if (floatInterval) { clearInterval(floatInterval); floatInterval = null; } }, 20000);
  }
  function cleanupFloatingHearts() { document.querySelectorAll('.heart-floating').forEach(el => el.remove()); if (floatInterval) { clearInterval(floatInterval); floatInterval = null; } }

  function smallBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 780; g.gain.value = 0.03;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.06);
    } catch (e) { /* ignore */ }
  }

  /* ========== Catch-the-heart game ========== */
  let gameRunning = false, collected = 0, elapsed = 0, fallInterval = null, timerInterval = null;
  function startCatchGame() {
    if (gameRunning) return;
    gameRunning = true; collected = 0; elapsed = 0;
    if (collectedEl) collectedEl.textContent = collected;
    if (elapsedEl) elapsedEl.textContent = elapsed;
    fallInterval = setInterval(spawnFallingHeart, 650);
    timerInterval = setInterval(() => { elapsed++; if (elapsedEl) elapsedEl.textContent = elapsed; }, 1000);
    setTimeout(() => stopCatchGame(), 60000);
  }
  function spawnFallingHeart() {
    if (!gameField) return;
    const h = document.createElement('div');
    h.className = 'falling-heart';
    h.textContent = ['❤️','💖','💕','💘'][Math.floor(Math.random() * 4)];
    h.style.left = (6 + Math.random() * 86) + '%';
    h.style.fontSize = (18 + Math.random() * 26) + 'px';
    const dur = 4200 + Math.random() * 2400;
    const anim = h.animate([
      { transform: 'translateY(0)' },
      { transform: `translateY(${gameField.clientHeight + 160}px)` }
    ], { duration: dur, easing: 'linear' });
    h.addEventListener('click', (e) => { e.stopPropagation(); collectHeart(h); anim.cancel(); });
    gameField.appendChild(h);
    setTimeout(() => { if (h.parentElement) h.remove(); }, dur + 120);
  }
  function collectHeart(el) {
    if (!el) return;
    el.animate([
      { transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(0.2)', opacity: 0 }
    ], { duration: 260, easing: 'ease-out' });
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 640; g.gain.value = 0.05;
      o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.06);
    } catch (e) { /* ignore */ }
    if (el.parentElement) el.remove();
    collected++; if (collectedEl) collectedEl.textContent = collected;
    updateRizz(10, 'Heart');
  }
  function stopCatchGame() {
    if (!gameRunning) return;
    gameRunning = false;
    if (fallInterval) { clearInterval(fallInterval); fallInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (gameField) gameField.querySelectorAll('div').forEach(d => d.remove());
    showToast(`You collected ${collected} hearts 💖`, 1400);
  }

  /* back button behavior */
  if (backUpBtn) {
    backUpBtn.addEventListener('click', () => {
      const tr = getComputedStyle(stack).transform;
      let step = 0;
      if (tr && tr !== 'none') {
        try {
          const matrix = new DOMMatrixReadOnly(tr);
          const ty = matrix.m42;
          step = Math.round(-ty / window.innerHeight);
        } catch (e) { step = 0; }
      }
      if (step === 2) {
        stopCatchGame(); slideTo(1); setTimeout(() => spawnFloatingHearts(), 600);
      } else if (step === 1) {
        slideTo(0);
      } else slideTo(0);
    });
  }

  /* ========== Secret balloon pop ========== */
  const balloonOverlay = document.getElementById('balloonOverlay');
  const balloonField = document.getElementById('balloonField');
  const poppedEl = document.getElementById('popped');
  const closeBalloon = document.getElementById('closeBalloon');
  let popped = 0, balloonTimer = null;

  if (secretEgg) {
    secretEgg.addEventListener('click', () => {
      popped = 0; if (poppedEl) poppedEl.textContent = popped;
      if (balloonOverlay) balloonOverlay.classList.remove('hidden');
      startSpawnBalloons();
    });
  }

  function startSpawnBalloons() {
    if (balloonTimer) return;
    spawnBalloon();
    balloonTimer = setInterval(spawnBalloon, 700);
    setTimeout(() => { if (balloonTimer) { clearInterval(balloonTimer); balloonTimer = null; } }, 30000);
  }
  function spawnBalloon() {
    if (!balloonField) return;
    const b = document.createElement('div');
    b.className = 'balloon-el';
    const colors = ['#ff6b9a', '#66ccff', '#ffb266', '#b78bff', '#7ce499'];
    const c = colors[Math.floor(Math.random() * colors.length)];
    b.style.background = `linear-gradient(180deg, ${c}, ${shadeColor(c, -18)})`;
    b.style.left = (6 + Math.random() * 82) + '%';
    const dur = 5 + Math.random() * 4;
    b.style.animationDuration = dur + 's';
    b.textContent = Math.random() > 0.6 ? '💘' : '🎈';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      popped++; if (poppedEl) poppedEl.textContent = popped;
      b.animate([{ transform: 'scale(0.6)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 260, easing: 'ease-out' });
      b.remove();
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.value = 520; g.gain.value = 0.08;
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.14);
        o.stop(audioCtx.currentTime + 0.14);
      } catch (e) { /* ignore */ }
      if (popped >= 10) finishBalloonGame(true);
    });
    balloonField.appendChild(b);
    setTimeout(() => { if (b.parentElement) b.remove(); }, dur * 1000 + 400);
  }
  function finishBalloonGame(won) {
    if (balloonTimer) { clearInterval(balloonTimer); balloonTimer = null; }
    if (won) {
      showToast('Secret unlocked! ✨ Rizz level ++', 1400);
      updateRizz(500, 'Secret unlocked');
    }
    setTimeout(() => { if (balloonOverlay) balloonOverlay.classList.add('hidden'); if (balloonField) balloonField.innerHTML = ''; }, 400);
  }
  if (closeBalloon) {
    closeBalloon.addEventListener('click', () => {
      if (balloonTimer) { clearInterval(balloonTimer); balloonTimer = null; }
      if (balloonField) balloonField.innerHTML = ''; if (balloonOverlay) balloonOverlay.classList.add('hidden');
    });
  }

  /* responsive resize listener (kept intentionally lightweight) */
  window.addEventListener('resize', () => {
    // animations read gameField.clientHeight each spawn so nothing to do here
  });

  /* keyboard: ESC closes overlays / goes back */
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (balloonOverlay && !balloonOverlay.classList.contains('hidden')) {
        if (closeBalloon) closeBalloon.click();
      } else {
        if (backUpBtn && !backUpBtn.classList.contains('hidden')) backUpBtn.click();
      }
    }
  });

  /* init */
  slideTo(0);

  /* cleanup on unload */
  window.addEventListener('beforeunload', () => {
    try {
      if (floatInterval) { clearInterval(floatInterval); floatInterval = null; }
      if (fallInterval) { clearInterval(fallInterval); fallInterval = null; }
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      if (balloonTimer) { clearInterval(balloonTimer); balloonTimer = null; }
      if (rizzAudioElem && typeof rizzAudioElem.pause === 'function') try { rizzAudioElem.pause(); } catch (e) {}
      if (audioCtx && typeof audioCtx.close === 'function') try { audioCtx.close(); } catch (e) {}
    } catch (e) { /* ignore */ }
  });

  /* ====== Paw button (particles + optional meow) ====== */
  const paw = document.getElementById('paw');
  const meow = document.getElementById('meow');
  const symbols = ['🐱', '🐾', '🐈', '😺', '😻'];

  // array of paw sound filenames (assumes files are hosted/available)
  const pawSounds = [
    'assets/audio/cat-meow-1-fx-306178.mp3',
    'assets/audio/cat-meow-8-fx-306184.mp3',
    'assets/audio/cat-meow-297927.mp3'
  ];

  if (paw) {
    paw.addEventListener('click', (ev) => {
      // play meow element if present
      try {
        if (meow && typeof meow.play === 'function') {
          meow.currentTime = 0; meow.volume = 0.2; meow.play().catch(() => {});
        }
      } catch (e) { /* ignore */ }

      // also play a random paw sound (file playback best-effort)
      try {
        const randomIndex = Math.floor(Math.random() * pawSounds.length);
        const soundSrc = pawSounds[randomIndex];
        const audio = new Audio(soundSrc);
        audio.play().catch(() => {});
      } catch (e) { /* ignore */ }

      // particles
      for (let i = 0; i < 6; i++) {
        const span = document.createElement('span');
        span.className = 'particle';
        span.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        document.body.appendChild(span);

        const rect = paw.getBoundingClientRect();
        span.style.left = rect.left + rect.width / 2 + 'px';
        span.style.top = rect.top + rect.height / 2 + 'px';

        const x = (Math.random() - 0.5) * 200 + 'px';
        const y = (Math.random() - 1) * 200 + 'px';
        span.style.setProperty('--x', x);
        span.style.setProperty('--y', y);

        setTimeout(() => span.remove(), 1000);
      }

      // small pulse animation for paw button
      try { paw.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' }); } catch (e) { }
    });
  }

  /* ====== Safe updateRizz ====== */
  let rizz = 0;
  const rizzValueEl = document.getElementById('rizzValue');
  const rizzCounterEl = document.getElementById('rizzCounter');

  function updateRizz(delta, label) {
    try {
      delta = Number(delta) || 0;
      rizz = Math.max(0, rizz + delta);
      if (rizzValueEl) rizzValueEl.textContent = rizz;

      if (rizzCounterEl) {
        try {
          rizzCounterEl.animate([
            { transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }
          ], { duration: 300, easing: 'ease-out' });
        } catch (inner) {
          rizzCounterEl.classList.add('rizz-pulse');
          setTimeout(() => rizzCounterEl.classList.remove('rizz-pulse'), 320);
        }
      }

      if (label) showToast(`${label} +${delta} Rizz`, 1100);
    } catch (err) {
      console.error('updateRizz error:', err);
    }
  }

});



/* -----------------
     favicon animation
     ----------------- */

const faviconFrames = [
  "assets/icons/frame_0.png",
  "assets/icons/frame_1.png"
];

let currentFavicon = 0;

function changeFavicon(frameIndex) {
  const link = document.getElementById("dynamic-favicon");
  if(link && frameIndex >= 0 && frameIndex < faviconFrames.length){
    link.href = faviconFrames[frameIndex];
    currentFavicon = frameIndex;
  }
}

setInterval(() => {
  const next = (currentFavicon + 1) % faviconFrames.length;
  changeFavicon(next);
}, 1000);