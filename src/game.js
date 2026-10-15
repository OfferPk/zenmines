/**
 * ZenMines - Frontend Game Controller & UI
 * Screens: main menu -> game (pause / result dialogs), journey stage select,
 * settings, statistics, how-to-play. Progress lives in localStorage.
 */

(function () {
  'use strict';

  var Logic = window.ZenMinesLogic;
  var Audio = window.ZenAudio;
  var Ads = window.ZenAds;
  var JOURNEY = Logic.JOURNEY;

  var KEYS = {
    stats: 'zenmines_stats',
    theme: 'zenmines_theme',
    progress: 'zenmines_progress',
    saved: 'zenmines_saved',
    longpress: 'zenmines_longpress'
  };

  var DIFF_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };

  var game = null;
  var session = { mode: 'classic', difficulty: 'beginner', stage: 1 };
  var timerInterval = null;
  var tapMode = 'reveal'; // 'reveal' or 'flag'
  var currentTheme = 'dark';
  var longPressEnabled = true;
  var longPressTimer = null;
  var didLongPress = false;
  var toastTimer = null;
  var resetArmed = false;

  function $(id) { return document.getElementById(id); }

  // DOM Elements
  var boardGrid = $('board-grid');
  var mineCountEl = $('mine-count');
  var timerEl = $('timer');
  var faceBtn = $('face-btn');
  var modeLabel = $('mode-label');
  var modeRevealBtn = $('mode-reveal');
  var modeFlagBtn = $('mode-flag');
  var hintBtn = $('hint-btn');
  var pauseBtn = $('pause-btn');
  var soundToggleBtn = $('sound-toggle');
  var statsBtn = $('stats-btn');
  var helpBtn = $('help-btn');
  var settingsBtn = $('settings-btn');
  var winBanner = $('win-banner');
  var toastEl = $('toast');
  var menuScreen = $('menu-screen');

  // Modals
  var statsModal = $('stats-modal');
  var helpModal = $('help-modal');
  var pauseModal = $('pause-modal');
  var resultModal = $('result-modal');
  var settingsModal = $('settings-modal');
  var journeyModal = $('journey-modal');

  // ---------- Storage helpers ----------
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage full or disabled: play continues without saving */ }
  }

  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function defaultStats() {
    return {
      played: 0,
      won: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestTimes: { beginner: null, intermediate: null, expert: null }
    };
  }

  function getStats() {
    var s = readJSON(KEYS.stats, null);
    if (!s || typeof s !== 'object') return defaultStats();
    if (!s.bestTimes) s.bestTimes = { beginner: null, intermediate: null, expert: null };
    return s;
  }

  function getProgress() {
    var p = readJSON(KEYS.progress, null);
    if (!p || typeof p !== 'object') p = {};
    if (typeof p.unlocked !== 'number' || p.unlocked < 1) p.unlocked = 1;
    p.unlocked = Math.min(JOURNEY.length, p.unlocked);
    if (!p.best || typeof p.best !== 'object') p.best = {};
    return p;
  }

  /** Records a finished round; returns { best, isRecord }. */
  function recordGameEnd(won, seconds) {
    var stats = getStats();
    var best = null;
    var isRecord = false;
    stats.played = (stats.played || 0) + 1;
    if (won) {
      stats.won = (stats.won || 0) + 1;
      stats.currentStreak = (stats.currentStreak || 0) + 1;
      if (stats.currentStreak > (stats.bestStreak || 0)) stats.bestStreak = stats.currentStreak;
    } else {
      stats.currentStreak = 0;
    }

    if (session.mode === 'classic') {
      var d = session.difficulty;
      if (won && (!hasTime(stats.bestTimes[d]) || seconds < stats.bestTimes[d])) {
        stats.bestTimes[d] = seconds;
        isRecord = true;
      }
      best = hasTime(stats.bestTimes[d]) ? stats.bestTimes[d] : null;
    } else {
      var progress = getProgress();
      var key = String(session.stage);
      if (won) {
        if (!hasTime(progress.best[key]) || seconds < progress.best[key]) {
          progress.best[key] = seconds;
          isRecord = true;
        }
        if (session.stage >= progress.unlocked && session.stage < JOURNEY.length) {
          progress.unlocked = session.stage + 1;
        }
        if (session.stage === JOURNEY.length) progress.completed = true;
        writeJSON(KEYS.progress, progress);
      }
      best = hasTime(progress.best[key]) ? progress.best[key] : null;
    }
    writeJSON(KEYS.stats, stats);
    return { best: best, isRecord: isRecord };
  }

  function saveCurrentGame() {
    if (!game) return;
    if (game.status === 'playing') {
      writeJSON(KEYS.saved, { session: session, data: game.serialize(), savedAt: Date.now() });
    } else {
      removeKey(KEYS.saved);
    }
  }

  function loadSavedGame() {
    var saved = readJSON(KEYS.saved, null);
    if (!saved || !saved.data || !saved.session) return null;
    try {
      var g = Logic.deserialize(saved.data);
      if (!g || g.status !== 'playing') return null;
      return { game: g, session: saved.session };
    } catch (e) {
      return null;
    }
  }

  // ---------- Formatting / header ----------
  function hasTime(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0;
  }

  function formatTime(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds || 0));
    var mins = Math.floor(s / 60);
    var secs = s % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function sessionLabel(sess) {
    sess = sess || session;
    if (sess.mode === 'journey') return 'Journey · Stage ' + sess.stage;
    return DIFF_LABELS[sess.difficulty] || 'Classic';
  }

  function updateHeader() {
    if (!game) return;
    var rem = game.getRemainingMines();
    mineCountEl.textContent = (rem >= 0 ? (rem < 10 ? '00' : (rem < 100 ? '0' : '')) : '-') + Math.abs(rem);
    timerEl.textContent = formatTime(game.getElapsedTime());

    if (game.status === 'won') {
      faceBtn.textContent = '😎';
    } else if (game.status === 'lost') {
      faceBtn.textContent = '😵';
    } else {
      faceBtn.textContent = '😊';
    }
    pauseBtn.disabled = game.status !== 'playing';
  }

  function ensureTimer() {
    if (timerInterval || !game || game.status !== 'playing') return;
    timerInterval = setInterval(function () {
      if (game && game.status === 'playing' && !game.isPaused()) updateHeader();
    }, 500);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ---------- Board rendering ----------
  function calculateCellSize(rows, cols) {
    var wrapper = document.querySelector('.board-wrapper');
    var maxW = (wrapper ? wrapper.clientWidth : window.innerWidth) - 48;
    var maxH = (wrapper ? wrapper.clientHeight : window.innerHeight * 0.6) - 48;
    var gap = 4;
    var sizeByW = Math.floor((maxW - gap * cols) / cols);
    var sizeByH = Math.floor((maxH - gap * rows) / rows);
    var size = Math.min(sizeByW, sizeByH);
    // Keep size between 26px (finger friendly) and 44px; larger boards scroll.
    return Math.max(26, Math.min(44, size));
  }

  function applyBoardSize() {
    if (!game) return;
    var cellSize = calculateCellSize(game.rows, game.cols);
    document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
    boardGrid.style.gridTemplateColumns = 'repeat(' + game.cols + ', ' + cellSize + 'px)';
    boardGrid.style.gridTemplateRows = 'repeat(' + game.rows + ', ' + cellSize + 'px)';
  }

  function renderBoard() {
    boardGrid.innerHTML = '';
    applyBoardSize();
    var frag = document.createDocumentFragment();
    for (var r = 0; r < game.rows; r++) {
      for (var c = 0; c < game.cols; c++) {
        var cellEl = document.createElement('div');
        cellEl.className = 'cell';
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;
        cellEl.setAttribute('role', 'button');
        updateCellElement(cellEl, game.grid[r][c]);
        frag.appendChild(cellEl);
      }
    }
    boardGrid.appendChild(frag);
  }

  function getCellElement(r, c) {
    return boardGrid.children[r * game.cols + c] || null;
  }

  function updateCellElement(el, cellData) {
    if (!el || !cellData) return;

    el.className = 'cell';
    el.textContent = '';
    delete el.dataset.num;
    var label = 'Hidden square';

    if (cellData.revealed) {
      el.classList.add('revealed');
      if (cellData.isMine) {
        el.classList.add('is-mine');
        el.textContent = '💣';
        label = 'Mine';
        if (cellData.exploded) el.classList.add('exploded');
      } else if (cellData.neighborMines > 0) {
        el.classList.add('number');
        el.dataset.num = cellData.neighborMines;
        el.textContent = cellData.neighborMines;
        label = cellData.neighborMines + ' neighbouring mines';
      } else {
        label = 'Empty';
      }
    } else if (cellData.flagged) {
      el.classList.add('flagged');
      el.textContent = '🚩';
      label = 'Flagged square';
    }

    if (cellData.wrongFlag) el.classList.add('wrong-flag');
    el.setAttribute('aria-label', label + ', row ' + (cellData.row + 1) + ', column ' + (cellData.col + 1));
  }

  function renderAllCells() {
    for (var r = 0; r < game.rows; r++) {
      for (var c = 0; c < game.cols; c++) {
        updateCellElement(getCellElement(r, c), game.grid[r][c]);
      }
    }
  }

  // ---------- Game flow ----------
  function handleCellAction(r, c, isFlagAction) {
    if (!game || game.status === 'won' || game.status === 'lost' || game.isPaused()) return;

    var cell = game.grid[r][c];

    // Tapping a revealed number chords.
    if (cell.revealed) {
      if (cell.neighborMines > 0 && !isFlagAction) {
        var chordRes = game.chord(r, c);
        if (chordRes.changed) {
          if (game.status === 'lost') {
            onLoss();
          } else {
            Audio.playChord();
            renderAllCells();
            updateHeader();
            afterMove();
          }
        }
      }
      return;
    }

    if (isFlagAction) {
      var flagRes = game.toggleFlag(r, c);
      if (flagRes.changed) {
        if (flagRes.flagged) Audio.playFlag(); else Audio.playUnflag();
        updateCellElement(getCellElement(r, c), flagRes.cell);
        updateHeader();
        afterMove();
      }
      return;
    }

    var res = game.reveal(r, c);
    if (!res.changed) return;

    if (res.status === 'lost') {
      onLoss();
      return;
    }

    if (res.revealedCells && res.revealedCells.length > 3) {
      Audio.playCascade(Math.min(res.revealedCells.length, 10));
    } else {
      Audio.playReveal();
    }
    for (var i = 0; i < res.revealedCells.length; i++) {
      var item = res.revealedCells[i];
      updateCellElement(getCellElement(item.row, item.col), item);
    }
    updateHeader();
    afterMove();
  }

  function afterMove() {
    if (game.status === 'won') {
      onWin();
      return;
    }
    ensureTimer();
    saveCurrentGame();
  }

  function onWin() {
    stopTimer();
    renderAllCells();
    updateHeader();
    Audio.playWin();
    removeKey(KEYS.saved);
    var secs = game.getElapsedTime();
    var rec = recordGameEnd(true, secs);
    showWinCelebration(secs);
    setTimeout(function () { showResult(true, secs, rec); }, 900);
  }

  function onLoss() {
    stopTimer();
    renderAllCells();
    updateHeader();
    Audio.playExplode();
    removeKey(KEYS.saved);
    var secs = game.getElapsedTime();
    var rec = recordGameEnd(false, secs);
    boardGrid.classList.add('shake');
    setTimeout(function () { boardGrid.classList.remove('shake'); }, 500);
    setTimeout(function () { showResult(false, secs, rec); }, 1100);
  }

  function showWinCelebration(secs) {
    winBanner.textContent = '🎉 Solved in ' + formatTime(secs) + '! 🎉';
    winBanner.style.display = 'block';
    setTimeout(function () { winBanner.style.display = 'none'; }, 2500);
  }

  function showResult(won, secs, rec) {
    if (menuScreen.classList.contains('open')) return; // player already left
    var isJourney = session.mode === 'journey';
    var finalStage = isJourney && session.stage === JOURNEY.length;
    $('result-emoji').textContent = won ? (finalStage ? '🏆' : '🎉') : '💥';
    $('result-title').textContent = won ? (finalStage ? 'Journey complete!' : 'Board cleared!') : 'Game over';
    var text;
    if (won) {
      text = rec.isRecord ? 'New personal best for ' + sessionLabel() + '!' : 'Calm and precise. Nicely done.';
      if (isJourney && !finalStage) text += ' Stage ' + (session.stage + 1) + ' unlocked.';
    } else {
      text = 'A mine went off. Take a breath and try again.';
    }
    $('result-text').textContent = text;
    $('result-time').textContent = formatTime(secs);
    $('result-best').textContent = hasTime(rec.best) ? formatTime(rec.best) : '--';
    var nextBtn = $('result-next');
    nextBtn.hidden = !(won && isJourney && !finalStage);
    $('result-retry').textContent = won ? '↻ Play again' : '↻ Try again';
    openModal(resultModal, won && isJourney && !finalStage ? nextBtn : $('result-retry'));
  }

  function newGameForSession(preserveSave) {
    stopTimer();
    document.body.classList.remove('is-paused');
    if (session.mode === 'journey') {
      var st = JOURNEY[Math.max(0, Math.min(JOURNEY.length - 1, session.stage - 1))];
      game = new Logic({ difficulty: 'journey', rows: st.rows, cols: st.cols, mines: st.mines });
    } else {
      game = new Logic({ difficulty: session.difficulty });
    }
    modeLabel.textContent = sessionLabel();
    renderBoard();
    updateHeader();
    if (preserveSave !== true) removeKey(KEYS.saved);
  }

  function startSession(sess) {
    session = { mode: sess.mode, difficulty: sess.difficulty || 'beginner', stage: sess.stage || 1 };
    closeAllModals();
    hideMenu();
    newGameForSession();
  }

  function finishRoundThen(action) {
    closeModal(resultModal);
    Promise.resolve(Ads.onGameFinished()).then(action, action);
  }

  // ---------- Pause ----------
  function pauseGame(silent) {
    if (!game || game.status !== 'playing') return false;
    var changed = game.pause();
    document.body.classList.add('is-paused');
    updateHeader();
    saveCurrentGame();
    if (!silent) Audio.playClick();
    return changed;
  }

  function resumeGame() {
    if (!game) return;
    document.body.classList.remove('is-paused');
    if (game.isPaused()) game.resume();
    updateHeader();
    ensureTimer();
  }

  function openPause() {
    if (!game || game.status !== 'playing') return;
    pauseGame(false);
    $('pause-mode').textContent = sessionLabel();
    $('pause-time').textContent = formatTime(game.getElapsedTime());
    openModal(pauseModal, $('pause-resume'));
  }

  function closePauseAndResume() {
    closeModal(pauseModal);
    resumeGame();
    Audio.playClick();
  }

  // ---------- Menu ----------
  function refreshMenu() {
    var progress = getProgress();
    var cleared = Object.keys(progress.best).length;
    $('menu-journey-info').textContent = progress.completed ? 'All ' + JOURNEY.length + ' cleared ✓' : 'Stage ' + progress.unlocked + ' / ' + JOURNEY.length;
    var saved = loadSavedGame();
    var cont = $('menu-continue');
    if (saved) {
      cont.hidden = false;
      $('menu-continue-info').textContent = sessionLabel(saved.session) + ' · ' + formatTime(saved.game.getElapsedTime());
    } else {
      cont.hidden = true;
    }
    $('journey-progress').textContent = cleared + ' / ' + JOURNEY.length;
  }

  function showMenu() {
    if (game && game.status === 'playing') {
      game.pause();
      saveCurrentGame();
    }
    stopTimer();
    closeAllModals();
    document.body.classList.remove('is-paused');
    refreshMenu();
    menuScreen.classList.add('open');
    menuScreen.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    var first = !$('menu-continue').hidden ? $('menu-continue') : $('menu-journey');
    if (first) first.focus();
  }

  function hideMenu() {
    menuScreen.classList.remove('open');
    menuScreen.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
  }

  function continueSaved() {
    var saved = loadSavedGame();
    if (!saved) {
      refreshMenu();
      return;
    }
    session = saved.session;
    game = saved.game;
    hideMenu();
    modeLabel.textContent = sessionLabel();
    renderBoard();
    resumeGame();
  }

  function renderJourney() {
    var progress = getProgress();
    var grid = $('journey-grid');
    grid.innerHTML = '';
    JOURNEY.forEach(function (st) {
      var btn = document.createElement('button');
      var locked = st.stage > progress.unlocked;
      var best = progress.best[String(st.stage)];
      var done = hasTime(best);
      btn.className = 'stage-btn' + (locked ? ' locked' : '') + (done ? ' cleared' : '');
      btn.disabled = locked;
      btn.innerHTML = '<strong>' + (locked ? '🔒' : st.stage) + '</strong><small>' + st.cols + '×' + st.rows + ' · ' + st.mines + '💣</small>' +
        '<small class="stage-best">' + (done ? '✓ ' + formatTime(best) : (locked ? 'Locked' : 'New')) + '</small>';
      btn.setAttribute('aria-label', 'Stage ' + st.stage + (locked ? ', locked' : '') + (done ? ', best ' + formatTime(best) : ''));
      btn.addEventListener('click', function () {
        Audio.playClick();
        startSession({ mode: 'journey', stage: st.stage });
      });
      grid.appendChild(btn);
    });
    $('journey-progress').textContent = Object.keys(progress.best).length + ' / ' + JOURNEY.length;
  }

  // ---------- Hint / toast ----------
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  function showHint() {
    if (!game) return;
    if (game.status === 'ready') {
      showToast('Tap any square to begin. Your first dig is always safe.');
      return;
    }
    if (game.status !== 'playing' || game.isPaused()) return;
    var hint = game.getHint();
    if (!hint) {
      showToast('No certain move found. Trust your instinct!');
      return;
    }
    Audio.playHint();
    showToast(hint.action === 'flag' ? 'This square must be a mine — flag it.' : 'This square is safe to dig.');
    var el = getCellElement(hint.row, hint.col);
    if (el) {
      el.classList.add('hint-target');
      setTimeout(function () { el.classList.remove('hint-target'); }, 2500);
    }
  }

  // ---------- Stats ----------
  function showStats() {
    var stats = getStats();
    var rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    $('stat-played').textContent = stats.played || 0;
    $('stat-winrate').textContent = rate + '%';
    $('stat-streak').textContent = stats.currentStreak || 0;
    $('stat-best-streak').textContent = stats.bestStreak || 0;
    var bt = stats.bestTimes || {};
    $('stat-best-beg').textContent = hasTime(bt.beginner) ? formatTime(bt.beginner) : '--';
    $('stat-best-int').textContent = hasTime(bt.intermediate) ? formatTime(bt.intermediate) : '--';
    $('stat-best-exp').textContent = hasTime(bt.expert) ? formatTime(bt.expert) : '--';
    openModal(statsModal);
  }

  // ---------- Modals ----------
  var modalStack = [];

  function openModal(modal, focusEl) {
    if (modal.classList.contains('open')) return;
    modalStack.push({ modal: modal, opener: document.activeElement });
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    var target = focusEl || modal.querySelector('.close-modal-btn') || modal.querySelector('button');
    if (target) target.focus();
  }

  function closeModal(modal) {
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    for (var i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].modal === modal) {
        var opener = modalStack[i].opener;
        modalStack.splice(i, 1);
        if (opener && typeof opener.focus === 'function' && document.body.contains(opener)) opener.focus();
        break;
      }
    }
    if (modal === settingsModal) disarmReset();
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.open').forEach(function (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    });
    modalStack = [];
    disarmReset();
  }

  function topModal() {
    return modalStack.length ? modalStack[modalStack.length - 1].modal : null;
  }

  /** Close button / Escape / backdrop behaviour, aware of pause + result. */
  function dismissModal(modal) {
    if (!modal) return;
    if (modal === pauseModal) {
      closePauseAndResume();
    } else if (modal === resultModal) {
      closeModal(resultModal); // keep the finished board visible
    } else {
      closeModal(modal);
    }
  }

  // ---------- Settings ----------
  function applyTheme(theme) {
    if (['dark', 'light', 'neon'].indexOf(theme) === -1) theme = 'dark';
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEYS.theme, theme); } catch (e) { /* ignore */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#edf4f4' : (theme === 'neon' ? '#080e0c' : '#081321'));
    $('set-theme').value = theme;
  }

  function syncSoundUI() {
    var on = Audio.isSoundEnabled();
    soundToggleBtn.textContent = on ? '🔊' : '🔇';
    soundToggleBtn.setAttribute('aria-pressed', String(on));
    soundToggleBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
    $('set-sound').checked = on;
  }

  function setSound(on) {
    Audio.setSoundEnabled(on);
    syncSoundUI();
    if (on) Audio.playClick();
  }

  function openSettings() {
    syncSoundUI();
    $('set-haptics').checked = Audio.isHapticsEnabled();
    $('set-longpress').checked = longPressEnabled;
    $('set-theme').value = currentTheme;
    openModal(settingsModal);
  }

  function disarmReset() {
    resetArmed = false;
    var btn = $('set-reset');
    if (btn) {
      btn.textContent = 'Reset';
      btn.classList.remove('armed');
    }
  }

  function handleReset() {
    var btn = $('set-reset');
    if (!resetArmed) {
      resetArmed = true;
      btn.textContent = 'Tap again to confirm';
      btn.classList.add('armed');
      return;
    }
    removeKey(KEYS.stats);
    removeKey(KEYS.progress);
    removeKey(KEYS.saved);
    disarmReset();
    Audio.playClick();
    showToast('Progress and statistics reset.');
    refreshMenu();
  }

  function updateModeUI() {
    modeRevealBtn.classList.toggle('active', tapMode === 'reveal');
    modeFlagBtn.classList.toggle('active', tapMode === 'flag');
    modeRevealBtn.setAttribute('aria-pressed', String(tapMode === 'reveal'));
    modeFlagBtn.setAttribute('aria-pressed', String(tapMode === 'flag'));
  }

  // ---------- Input (event delegation on the board) ----------
  function cellFromEvent(e) {
    var el = e.target && e.target.closest ? e.target.closest('.cell') : null;
    if (!el || !boardGrid.contains(el)) return null;
    return { el: el, r: parseInt(el.dataset.row, 10), c: parseInt(el.dataset.col, 10) };
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (game && game.status === 'playing') faceBtn.textContent = '😊';
  }

  function bindBoardInput() {
    boardGrid.addEventListener('click', function (e) {
      var hit = cellFromEvent(e);
      if (!hit) return;
      if (didLongPress) {
        didLongPress = false;
        return;
      }
      handleCellAction(hit.r, hit.c, tapMode === 'flag');
    });

    boardGrid.addEventListener('contextmenu', function (e) {
      var hit = cellFromEvent(e);
      if (!hit) return;
      e.preventDefault();
      if (didLongPress) return; // touch long-press already handled it
      handleCellAction(hit.r, hit.c, true);
    });

    boardGrid.addEventListener('pointerdown', function (e) {
      var hit = cellFromEvent(e);
      if (!hit || !game || game.status === 'won' || game.status === 'lost') return;
      if (e.button && e.button !== 0) return;
      faceBtn.textContent = '😮';
      didLongPress = false;
      if (!longPressEnabled || e.pointerType === 'mouse') return;
      longPressTimer = setTimeout(function () {
        longPressTimer = null;
        didLongPress = true;
        handleCellAction(hit.r, hit.c, tapMode !== 'flag');
      }, 380);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
      boardGrid.addEventListener(evt, cancelLongPress);
    });
  }

  // ---------- Init ----------
  function isNativeApp() {
    var cap = window.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  }

  function on(id, handler) {
    $(id).addEventListener('click', function (e) {
      handler(e);
    });
  }

  function init() {
    Audio.init();

    var savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem(KEYS.theme) || 'dark';
      longPressEnabled = localStorage.getItem(KEYS.longpress) !== '0';
    } catch (e) { /* storage disabled: defaults */ }
    applyTheme(savedTheme);
    syncSoundUI();
    updateModeUI();
    bindBoardInput();

    // Header / toolbar
    faceBtn.addEventListener('click', function () {
      Audio.playClick();
      closeModal(resultModal);
      newGameForSession();
    });
    on('mode-reveal', function () { tapMode = 'reveal'; Audio.playClick(); updateModeUI(); });
    on('mode-flag', function () { tapMode = 'flag'; Audio.playClick(); updateModeUI(); });
    hintBtn.addEventListener('click', showHint);
    pauseBtn.addEventListener('click', openPause);
    soundToggleBtn.addEventListener('click', function () { setSound(!Audio.isSoundEnabled()); });
    statsBtn.addEventListener('click', function () { Audio.playClick(); showStats(); });
    helpBtn.addEventListener('click', function () { Audio.playClick(); openModal(helpModal); });
    settingsBtn.addEventListener('click', function () { Audio.playClick(); openSettings(); });

    // Main menu
    on('menu-continue', function () { Audio.playClick(); continueSaved(); });
    on('menu-journey', function () { Audio.playClick(); renderJourney(); openModal(journeyModal); });
    document.querySelectorAll('.menu-diff [data-diff]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Audio.playClick();
        startSession({ mode: 'classic', difficulty: btn.getAttribute('data-diff') });
      });
    });
    on('menu-settings', function () { Audio.playClick(); openSettings(); });
    on('menu-stats', function () { Audio.playClick(); showStats(); });
    on('menu-help', function () { Audio.playClick(); openModal(helpModal); });

    // Pause dialog
    on('pause-resume', closePauseAndResume);
    on('pause-restart', function () {
      Audio.playClick();
      closeModal(pauseModal);
      document.body.classList.remove('is-paused');
      newGameForSession();
    });
    on('pause-settings', function () { Audio.playClick(); openSettings(); });
    on('pause-menu', function () { Audio.playClick(); showMenu(); });

    // Result dialog
    on('result-next', function () {
      Audio.playClick();
      finishRoundThen(function () {
        session.stage = Math.min(JOURNEY.length, session.stage + 1);
        newGameForSession();
      });
    });
    on('result-retry', function () {
      Audio.playClick();
      finishRoundThen(function () { newGameForSession(); });
    });
    on('result-review', function () { Audio.playClick(); closeModal(resultModal); });
    on('result-menu', function () {
      Audio.playClick();
      finishRoundThen(showMenu);
    });

    // Settings
    $('set-sound').addEventListener('change', function () { setSound(this.checked); });
    $('set-haptics').addEventListener('change', function () {
      Audio.setHapticsEnabled(this.checked);
      Audio.playClick();
    });
    $('set-longpress').addEventListener('change', function () {
      longPressEnabled = this.checked;
      try { localStorage.setItem(KEYS.longpress, longPressEnabled ? '1' : '0'); } catch (e) { /* ignore */ }
      Audio.playClick();
    });
    $('set-theme').addEventListener('change', function () {
      Audio.playClick();
      applyTheme(this.value);
    });
    on('set-reset', handleReset);

    // Generic modal closing
    document.querySelectorAll('.close-modal-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Audio.playClick();
        dismissModal(btn.closest('.modal-overlay'));
      });
    });
    document.querySelectorAll('.modal-overlay').forEach(function (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) dismissModal(modal);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var top = topModal();
        if (top) dismissModal(top);
        else if (!menuScreen.classList.contains('open')) openPause();
      } else if ((event.key === 'p' || event.key === 'P') && !topModal() && !menuScreen.classList.contains('open')) {
        openPause();
      } else if ((event.key === 'f' || event.key === 'F') && !topModal()) {
        tapMode = tapMode === 'flag' ? 'reveal' : 'flag';
        updateModeUI();
      }
    });

    // Auto-pause when the app goes to background
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game && game.status === 'playing' && !game.isPaused() && !menuScreen.classList.contains('open')) {
        openPause();
      }
    });
    window.addEventListener('pagehide', saveCurrentGame);

    // Android hardware back button (native app only, via @capacitor/app)
    var capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (isNativeApp() && capApp && typeof capApp.addListener === 'function') {
      capApp.addListener('backButton', function () {
        var top = topModal();
        if (top) {
          dismissModal(top);
        } else if (!menuScreen.classList.contains('open')) {
          if (game && game.status === 'playing') openPause(); else showMenu();
        } else if (typeof capApp.minimizeApp === 'function') {
          capApp.minimizeApp();
        }
      });
    }

    var resizeRaf = null;
    window.addEventListener('resize', function () {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(applyBoardSize);
    });

    // Register Service Worker (web only; skipped inside the native app shell)
    if ('serviceWorker' in navigator && !isNativeApp() && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline cache optional */ });
    }

    Ads.init();

    // Background board behind the menu, then show the menu.
    session = { mode: 'classic', difficulty: 'beginner', stage: 1 };
    newGameForSession(true); // keep any saved board for "Continue"
    showMenu();
  }

  // Exposed for automated smoke tests only (read-only helpers).
  window.ZenMinesApp = {
    getGame: function () { return game; },
    getSession: function () { return session; },
    startSession: startSession,
    showMenu: showMenu
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
