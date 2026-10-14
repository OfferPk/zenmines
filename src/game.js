/**
 * ZenMines - Frontend Game Controller & UI
 */

(function () {
  'use strict';

  var Logic = window.ZenMinesLogic;
  var Audio = window.ZenAudio;

  var game = null;
  var timerInterval = null;
  var tapMode = 'reveal'; // 'reveal' or 'flag'
  var currentTheme = 'dark';
  var longPressTimer = null;
  var didLongPress = false;

  // DOM Elements
  var boardGrid = document.getElementById('board-grid');
  var mineCountEl = document.getElementById('mine-count');
  var timerEl = document.getElementById('timer');
  var faceBtn = document.getElementById('face-btn');
  var diffSelect = document.getElementById('diff-select');
  var modeRevealBtn = document.getElementById('mode-reveal');
  var modeFlagBtn = document.getElementById('mode-flag');
  var hintBtn = document.getElementById('hint-btn');
  var soundToggleBtn = document.getElementById('sound-toggle');
  var themeToggleBtn = document.getElementById('theme-toggle');
  var statsBtn = document.getElementById('stats-btn');
  var helpBtn = document.getElementById('help-btn');
  var winBanner = document.getElementById('win-banner');

  // Modals
  var statsModal = document.getElementById('stats-modal');
  var helpModal = document.getElementById('help-modal');

  // Load Saved Stats
  function getStats() {
    try {
      var raw = localStorage.getItem('zenmines_stats');
      return raw ? JSON.parse(raw) : {
        played: 0,
        won: 0,
        currentStreak: 0,
        bestStreak: 0,
        bestTimes: { beginner: null, intermediate: null, expert: null }
      };
    } catch (e) {
      return { played: 0, won: 0, currentStreak: 0, bestStreak: 0, bestTimes: {} };
    }
  }

  function saveStats(stats) {
    try {
      localStorage.setItem('zenmines_stats', JSON.stringify(stats));
    } catch (e) {}
  }

  function recordGameEnd(won, difficulty, seconds) {
    var stats = getStats();
    stats.played = (stats.played || 0) + 1;
    if (won) {
      stats.won = (stats.won || 0) + 1;
      stats.currentStreak = (stats.currentStreak || 0) + 1;
      if (stats.currentStreak > (stats.bestStreak || 0)) {
        stats.bestStreak = stats.currentStreak;
      }
      if (stats.bestTimes && difficulty in stats.bestTimes) {
        if (!stats.bestTimes[difficulty] || seconds < stats.bestTimes[difficulty]) {
          stats.bestTimes[difficulty] = seconds;
        }
      }
    } else {
      stats.currentStreak = 0;
    }
    saveStats(stats);
  }

  function formatTime(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds || 0));
    var mins = Math.floor(s / 60);
    var secs = s % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function updateHeader() {
    if (!game) return;
    var rem = game.getRemainingMines();
    mineCountEl.textContent = (rem >= 0 ? (rem < 10 ? '0' : '') : '-') + Math.abs(rem);
    timerEl.textContent = formatTime(game.getElapsedTime());

    if (game.status === 'won') {
      faceBtn.textContent = '😎';
    } else if (game.status === 'lost') {
      faceBtn.textContent = '😵';
    } else {
      faceBtn.textContent = '😊';
    }
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(function () {
      if (game && game.status === 'playing') {
        updateHeader();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function calculateCellSize(rows, cols) {
    var wrapper = document.querySelector('.board-wrapper');
    var maxW = (wrapper ? wrapper.clientWidth : window.innerWidth) - 48;
    var maxH = (wrapper ? wrapper.clientHeight : window.innerHeight * 0.6) - 48;

    var sizeByW = Math.floor(maxW / cols);
    var sizeByH = Math.floor(maxH / rows);
    var size = Math.min(sizeByW, sizeByH);

    // Keep size between 26px and 44px
    return Math.max(26, Math.min(44, size));
  }

  function renderBoard() {
    boardGrid.innerHTML = '';
    var cellSize = calculateCellSize(game.rows, game.cols);
    document.documentElement.style.setProperty('--cell-size', cellSize + 'px');

    boardGrid.style.gridTemplateColumns = 'repeat(' + game.cols + ', ' + cellSize + 'px)';
    boardGrid.style.gridTemplateRows = 'repeat(' + game.rows + ', ' + cellSize + 'px)';

    for (var r = 0; r < game.rows; r++) {
      for (var c = 0; c < game.cols; c++) {
        var cellEl = document.createElement('div');
        cellEl.className = 'cell';
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;
        updateCellElement(cellEl, game.grid[r][c]);
        attachCellEvents(cellEl, r, c);
        boardGrid.appendChild(cellEl);
      }
    }
  }

  function getCellElement(r, c) {
    return boardGrid.querySelector('.cell[data-row="' + r + '"][data-col="' + c + '"]');
  }

  function updateCellElement(el, cellData) {
    if (!el || !cellData) return;

    el.className = 'cell';
    el.textContent = '';
    delete el.dataset.num;

    if (cellData.revealed) {
      el.classList.add('revealed');
      if (cellData.isMine) {
        el.classList.add('is-mine');
        el.textContent = '💣';
        if (cellData.exploded) {
          el.classList.add('exploded');
        }
      } else if (cellData.neighborMines > 0) {
        el.classList.add('number');
        el.dataset.num = cellData.neighborMines;
        el.textContent = cellData.neighborMines;
      }
    } else if (cellData.flagged) {
      el.classList.add('flagged');
      el.textContent = '🚩';
    }

    if (cellData.wrongFlag) {
      el.classList.add('wrong-flag');
    }
  }

  function handleCellAction(r, c, isFlagAction) {
    if (!game || game.status === 'won' || game.status === 'lost') return;

    var cell = game.grid[r][c];

    // If clicking a revealed number, chord!
    if (cell.revealed && cell.neighborMines > 0 && !isFlagAction) {
      var chordRes = game.chord(r, c);
      if (chordRes.changed) {
        Audio.playChord();
        renderAllCells();
        updateHeader();
        checkGameStatus();
      }
      return;
    }

    if (isFlagAction) {
      var flagRes = game.toggleFlag(r, c);
      if (flagRes.changed) {
        if (flagRes.flagged) {
          Audio.playFlag();
        } else {
          Audio.playUnflag();
        }
        updateCellElement(getCellElement(r, c), flagRes.cell);
        updateHeader();
      }
    } else {
      var wasReady = game.status === 'ready';
      var res = game.reveal(r, c);
      if (res.changed) {
        if (wasReady) {
          startTimer();
        }

        if (res.status === 'lost') {
          Audio.playExplode();
          stopTimer();
          renderAllCells();
          updateHeader();
          recordGameEnd(false, game.difficulty, game.getElapsedTime());
        } else {
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
          checkGameStatus();
        }
      }
    }
  }

  function checkGameStatus() {
    if (game.status === 'won') {
      stopTimer();
      renderAllCells();
      updateHeader();
      Audio.playWin();
      showWinCelebration();
      recordGameEnd(true, game.difficulty, game.getElapsedTime());
    }
  }

  function renderAllCells() {
    for (var r = 0; r < game.rows; r++) {
      for (var c = 0; c < game.cols; c++) {
        updateCellElement(getCellElement(r, c), game.grid[r][c]);
      }
    }
  }

  function showWinCelebration() {
    winBanner.textContent = '🎉 Solved in ' + formatTime(game.getElapsedTime()) + '! 🎉';
    winBanner.style.display = 'block';
    setTimeout(function () {
      winBanner.style.display = 'none';
    }, 4000);
  }

  function attachCellEvents(el, r, c) {
    // Left click / Tap
    el.addEventListener('click', function (e) {
      if (didLongPress) {
        didLongPress = false;
        return;
      }
      var isFlag = (tapMode === 'flag');
      handleCellAction(r, c, isFlag);
    });

    // Right click
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      handleCellAction(r, c, true);
    });

    // Mobile Long Press for opposite action
    el.addEventListener('pointerdown', function (e) {
      faceBtn.textContent = '😮';
      didLongPress = false;
      longPressTimer = setTimeout(function () {
        didLongPress = true;
        var isFlag = (tapMode !== 'flag'); // opposite of current mode
        handleCellAction(r, c, isFlag);
      }, 350);
    });

    var cancelLongPress = function () {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (game && game.status === 'playing') {
        faceBtn.textContent = '😊';
      }
    };

    el.addEventListener('pointerup', cancelLongPress);
    el.addEventListener('pointercancel', cancelLongPress);
    el.addEventListener('pointerleave', cancelLongPress);
  }

  function startNewGame(diff) {
    stopTimer();
    var difficulty = diff || diffSelect.value;
    game = new Logic({ difficulty: difficulty });
    renderBoard();
    updateHeader();
  }

  function updateModeUI() {
    if (tapMode === 'reveal') {
      modeRevealBtn.classList.add('active');
      modeFlagBtn.classList.remove('active');
    } else {
      modeFlagBtn.classList.add('active');
      modeRevealBtn.classList.remove('active');
    }
    modeRevealBtn.setAttribute('aria-pressed', String(tapMode === 'reveal'));
    modeFlagBtn.setAttribute('aria-pressed', String(tapMode === 'flag'));
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('zenmines_theme', theme);
    } catch (e) {}
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : (theme === 'light' ? '☀️' : '⚡');
    var nextTheme = theme === 'dark' ? 'light' : (theme === 'light' ? 'neon' : 'dark');
    themeToggleBtn.setAttribute('aria-label', 'Switch to ' + nextTheme + ' theme');
    themeToggleBtn.title = 'Switch to ' + nextTheme + ' theme';
  }

  function cycleTheme() {
    var themes = ['dark', 'light', 'neon'];
    var idx = themes.indexOf(currentTheme);
    var next = themes[(idx + 1) % themes.length];
    applyTheme(next);
  }

  function showHint() {
    if (!game || game.status !== 'playing') return;
    var hint = game.getHint();
    if (!hint) {
      alert('No obvious safe moves deduced. Try another cell!');
      return;
    }

    Audio.playHint();
    var el = getCellElement(hint.row, hint.col);
    if (el) {
      el.classList.add('hint-target');
      setTimeout(function () {
        el.classList.remove('hint-target');
      }, 2500);
    }
  }

  function showStats() {
    var stats = getStats();
    var rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

    document.getElementById('stat-played').textContent = stats.played;
    document.getElementById('stat-winrate').textContent = rate + '%';
    document.getElementById('stat-streak').textContent = stats.currentStreak || 0;
    document.getElementById('stat-best-streak').textContent = stats.bestStreak || 0;

    var bTime = stats.bestTimes ? stats.bestTimes.beginner : null;
    var iTime = stats.bestTimes ? stats.bestTimes.intermediate : null;
    var eTime = stats.bestTimes ? stats.bestTimes.expert : null;

    document.getElementById('stat-best-beg').textContent = bTime ? formatTime(bTime) : '--';
    document.getElementById('stat-best-int').textContent = iTime ? formatTime(iTime) : '--';
    document.getElementById('stat-best-exp').textContent = eTime ? formatTime(eTime) : '--';

    openModal(statsModal);
  }

  var modalOpener = null;

  function openModal(modal) {
    modalOpener = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    var closeButton = modal.querySelector('.close-modal-btn');
    if (closeButton) closeButton.focus();
  }

  function closeModal(modal) {
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (modalOpener && typeof modalOpener.focus === 'function') modalOpener.focus();
    modalOpener = null;
  }

  // Initialize
  function init() {
    Audio.init();

    // Load saved theme
    try {
      var savedTheme = localStorage.getItem('zenmines_theme') || 'dark';
      applyTheme(savedTheme);
    } catch (e) {}

    // Sound toggle state
    soundToggleBtn.textContent = Audio.isSoundEnabled() ? '🔊' : '🔇';
    soundToggleBtn.setAttribute('aria-pressed', String(Audio.isSoundEnabled()));

    // Event Listeners
    faceBtn.addEventListener('click', function () {
      Audio.playClick();
      startNewGame();
    });

    diffSelect.addEventListener('change', function () {
      Audio.playClick();
      startNewGame(this.value);
    });

    modeRevealBtn.addEventListener('click', function () {
      tapMode = 'reveal';
      Audio.playClick();
      updateModeUI();
    });

    modeFlagBtn.addEventListener('click', function () {
      tapMode = 'flag';
      Audio.playClick();
      updateModeUI();
    });

    hintBtn.addEventListener('click', showHint);

    soundToggleBtn.addEventListener('click', function () {
      var nextState = !Audio.isSoundEnabled();
      Audio.setSoundEnabled(nextState);
      soundToggleBtn.textContent = nextState ? '🔊' : '🔇';
      soundToggleBtn.setAttribute('aria-pressed', String(nextState));
      Audio.playClick();
    });

    themeToggleBtn.addEventListener('click', function () {
      Audio.playClick();
      cycleTheme();
    });

    statsBtn.addEventListener('click', function () {
      Audio.playClick();
      showStats();
    });

    helpBtn.addEventListener('click', function () {
      Audio.playClick();
      openModal(helpModal);
    });

    document.querySelectorAll('.close-modal-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Audio.playClick();
        closeModal(btn.closest('.modal-overlay'));
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(function (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeModal(document.querySelector('.modal-overlay.open'));
      }
    });

    window.addEventListener('resize', function () {
      if (game) {
        var cellSize = calculateCellSize(game.rows, game.cols);
        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
        boardGrid.style.gridTemplateColumns = 'repeat(' + game.cols + ', ' + cellSize + 'px)';
        boardGrid.style.gridTemplateRows = 'repeat(' + game.rows + ', ' + cellSize + 'px)';
      }
    });

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }

    startNewGame('beginner');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
