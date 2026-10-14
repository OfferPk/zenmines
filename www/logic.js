/**
 * ZenMines - Pure Game Logic
 * Platform-independent, deterministic, 100% testable in Node and Browser.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZenMinesLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10, label: 'Beginner' },
    intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermediate' },
    expert: { rows: 16, cols: 30, mines: 99, label: 'Expert' }
  };

  /**
   * Linear Congruential Generator / pseudo-random generator
   * Allows deterministic test runs when seed is provided.
   */
  function createRng(seed) {
    if (typeof seed === 'number') {
      var s = seed >>> 0;
      return function () {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }
    return Math.random;
  }

  function getNeighbors(row, col, rows, cols) {
    var neighbors = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = row + dr;
        var nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          neighbors.push({ row: nr, col: nc });
        }
      }
    }
    return neighbors;
  }

  function ZenMines(options) {
    options = options || {};
    var diffKey = options.difficulty || 'beginner';
    var preset = DIFFICULTIES[diffKey] || DIFFICULTIES.beginner;

    this.difficulty = diffKey;
    this.rows = options.rows || preset.rows;
    this.cols = options.cols || preset.cols;
    this.minesCount = options.mines !== undefined ? options.mines : preset.mines;

    // Bounds checking
    this.rows = Math.max(4, Math.min(50, this.rows));
    this.cols = Math.max(4, Math.min(50, this.cols));
    var maxMines = (this.rows * this.cols) - 1;
    this.minesCount = Math.max(1, Math.min(maxMines, this.minesCount));

    this.rng = createRng(options.seed);
    this.status = 'ready'; // 'ready', 'playing', 'won', 'lost'
    this.firstClick = true;
    this.flagsPlaced = 0;
    this.revealedCount = 0;
    this.totalCells = this.rows * this.cols;
    this.safeCells = this.totalCells - this.minesCount;
    this.startTime = null;
    this.endTime = null;
    this.elapsedSeconds = 0;

    this.grid = [];
    this.initGrid();
  }

  ZenMines.DIFFICULTIES = DIFFICULTIES;

  ZenMines.prototype.initGrid = function () {
    this.grid = [];
    for (var r = 0; r < this.rows; r++) {
      var row = [];
      for (var c = 0; c < this.cols; c++) {
        row.push({
          row: r,
          col: c,
          isMine: false,
          revealed: false,
          flagged: false,
          neighborMines: 0,
          exploded: false,
          wrongFlag: false
        });
      }
      this.grid.push(row);
    }
  };

  /**
   * Places mines ensuring the first clicked cell (and ideally surrounding cells) are safe.
   */
  ZenMines.prototype.placeMines = function (safeRow, safeCol) {
    var safeKeys = {};
    safeKeys[safeRow + ',' + safeCol] = true;

    // If board is large enough, keep the 3x3 neighborhood around safeRow, safeCol free of mines
    // so the opening click always reveals a cluster.
    var neighbors = getNeighbors(safeRow, safeCol, this.rows, this.cols);
    if (this.totalCells - this.minesCount >= neighbors.length + 1) {
      for (var i = 0; i < neighbors.length; i++) {
        safeKeys[neighbors[i].row + ',' + neighbors[i].col] = true;
      }
    }

    var available = [];
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (!safeKeys[r + ',' + c]) {
          available.push({ row: r, col: c });
        }
      }
    }

    // Shuffle available cells with Fisher-Yates
    for (var j = available.length - 1; j > 0; j--) {
      var k = Math.floor(this.rng() * (j + 1));
      var temp = available[j];
      available[j] = available[k];
      available[k] = temp;
    }

    // Place mines
    var placed = 0;
    for (var m = 0; m < available.length && placed < this.minesCount; m++) {
      var cell = this.grid[available[m].row][available[m].col];
      cell.isMine = true;
      placed++;
    }

    // Recalculate neighbor numbers
    for (var rowIdx = 0; rowIdx < this.rows; rowIdx++) {
      for (var colIdx = 0; colIdx < this.cols; colIdx++) {
        var current = this.grid[rowIdx][colIdx];
        if (current.isMine) continue;
        var nList = getNeighbors(rowIdx, colIdx, this.rows, this.cols);
        var count = 0;
        for (var ni = 0; ni < nList.length; ni++) {
          if (this.grid[nList[ni].row][nList[ni].col].isMine) {
            count++;
          }
        }
        current.neighborMines = count;
      }
    }
  };

  ZenMines.prototype.reveal = function (row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return { changed: false };
    }
    if (this.status === 'won' || this.status === 'lost') {
      return { changed: false, status: this.status };
    }

    var cell = this.grid[row][col];
    if (cell.revealed || cell.flagged) {
      return { changed: false, status: this.status };
    }

    // First click setup
    if (this.firstClick) {
      this.placeMines(row, col);
      this.firstClick = false;
      this.status = 'playing';
      this.startTime = Date.now();
    }

    // Hit a mine!
    if (cell.isMine) {
      this.status = 'lost';
      this.endTime = Date.now();
      cell.exploded = true;
      cell.revealed = true;

      // Reveal all mines & mark wrong flags
      var mineCells = [];
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          var target = this.grid[r][c];
          if (target.isMine && !target.flagged) {
            target.revealed = true;
            mineCells.push(target);
          } else if (!target.isMine && target.flagged) {
            target.wrongFlag = true;
          }
        }
      }

      return {
        changed: true,
        status: 'lost',
        explodedCell: cell,
        revealedCells: mineCells
      };
    }

    // Safe cell reveal with flood-fill for 0-neighbor cells
    var queue = [cell];
    var newlyRevealed = [];
    cell.revealed = true;
    this.revealedCount++;
    newlyRevealed.push(cell);

    while (queue.length > 0) {
      var curr = queue.shift();
      if (curr.neighborMines === 0) {
        var nbrs = getNeighbors(curr.row, curr.col, this.rows, this.cols);
        for (var i = 0; i < nbrs.length; i++) {
          var nCell = this.grid[nbrs[i].row][nbrs[i].col];
          if (!nCell.revealed && !nCell.flagged && !nCell.isMine) {
            nCell.revealed = true;
            this.revealedCount++;
            newlyRevealed.push(nCell);
            if (nCell.neighborMines === 0) {
              queue.push(nCell);
            }
          }
        }
      }
    }

    // Check win condition
    if (this.revealedCount >= this.safeCells) {
      this.status = 'won';
      this.endTime = Date.now();
      // Auto-flag all mines
      for (var wr = 0; wr < this.rows; wr++) {
        for (var wc = 0; wc < this.cols; wc++) {
          var winCell = this.grid[wr][wc];
          if (winCell.isMine && !winCell.flagged) {
            winCell.flagged = true;
            this.flagsPlaced++;
          }
        }
      }
    }

    return {
      changed: true,
      status: this.status,
      revealedCells: newlyRevealed
    };
  };

  ZenMines.prototype.toggleFlag = function (row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return { changed: false };
    }
    if (this.status === 'won' || this.status === 'lost') {
      return { changed: false, status: this.status };
    }

    var cell = this.grid[row][col];
    if (cell.revealed) {
      return { changed: false, status: this.status };
    }

    if (this.firstClick) {
      this.status = 'playing';
      this.startTime = Date.now();
    }

    cell.flagged = !cell.flagged;
    if (cell.flagged) {
      this.flagsPlaced++;
    } else {
      this.flagsPlaced--;
    }

    return {
      changed: true,
      status: this.status,
      cell: cell,
      flagged: cell.flagged,
      remainingMines: this.minesCount - this.flagsPlaced
    };
  };

  /**
   * Chording: When clicking a revealed cell with a number,
   * if flagged neighbor count equals the cell number, reveal all unflagged neighbors!
   */
  ZenMines.prototype.chord = function (row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return { changed: false };
    }
    if (this.status !== 'playing') {
      return { changed: false, status: this.status };
    }

    var cell = this.grid[row][col];
    if (!cell.revealed || cell.neighborMines === 0) {
      return { changed: false, status: this.status };
    }

    var neighbors = getNeighbors(row, col, this.rows, this.cols);
    var flaggedCount = 0;
    var unrevealed = [];

    for (var i = 0; i < neighbors.length; i++) {
      var n = this.grid[neighbors[i].row][neighbors[i].col];
      if (n.flagged) {
        flaggedCount++;
      } else if (!n.revealed) {
        unrevealed.push(n);
      }
    }

    if (flaggedCount !== cell.neighborMines || unrevealed.length === 0) {
      return { changed: false, status: this.status };
    }

    // Reveal unrevealed neighbors
    var hitMine = null;
    var allRevealed = [];

    for (var j = 0; j < unrevealed.length; j++) {
      var target = unrevealed[j];
      var res = this.reveal(target.row, target.col);
      if (res.changed && res.revealedCells) {
        allRevealed = allRevealed.concat(res.revealedCells);
      }
      if (res.status === 'lost') {
        hitMine = res.explodedCell;
        break;
      }
    }

    return {
      changed: true,
      status: this.status,
      revealedCells: allRevealed,
      explodedCell: hitMine
    };
  };

  /**
   * Hint deduction helper: finds a cell that can be logically flagged or revealed.
   */
  ZenMines.prototype.getHint = function () {
    if (this.status !== 'playing' || this.firstClick) {
      return null;
    }

    // Look for obvious single-cell deductions
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var cell = this.grid[r][c];
        if (!cell.revealed || cell.neighborMines === 0) continue;

        var neighbors = getNeighbors(r, c, this.rows, this.cols);
        var unrevealed = [];
        var flags = 0;

        for (var i = 0; i < neighbors.length; i++) {
          var n = this.grid[neighbors[i].row][neighbors[i].col];
          if (n.flagged) flags++;
          else if (!n.revealed) unrevealed.push(n);
        }

        if (unrevealed.length === 0) continue;

        // Deduction 1: flags needed == unrevealed count -> all unrevealed are mines!
        if (cell.neighborMines - flags === unrevealed.length) {
          return {
            action: 'flag',
            row: unrevealed[0].row,
            col: unrevealed[0].col,
            reason: 'Around ' + cell.neighborMines + ' at (' + (r + 1) + ',' + (c + 1) + '), all remaining neighbors must be mines.'
          };
        }

        // Deduction 2: flags == cell number -> all remaining unrevealed are safe!
        if (cell.neighborMines === flags) {
          return {
            action: 'reveal',
            row: unrevealed[0].row,
            col: unrevealed[0].col,
            reason: 'All ' + cell.neighborMines + ' mines around (' + (r + 1) + ',' + (c + 1) + ') are flagged. This neighbor is safe.'
          };
        }
      }
    }

    return null;
  };

  ZenMines.prototype.getRemainingMines = function () {
    return this.minesCount - this.flagsPlaced;
  };

  ZenMines.prototype.getElapsedTime = function () {
    if (!this.startTime) return this.elapsedSeconds;
    if (this.status === 'won' || this.status === 'lost') {
      return Math.floor(((this.endTime || Date.now()) - this.startTime) / 1000);
    }
    return Math.floor((Date.now() - this.startTime) / 1000) + this.elapsedSeconds;
  };

  ZenMines.prototype.serialize = function () {
    return {
      difficulty: this.difficulty,
      rows: this.rows,
      cols: this.cols,
      minesCount: this.minesCount,
      status: this.status,
      firstClick: this.firstClick,
      flagsPlaced: this.flagsPlaced,
      revealedCount: this.revealedCount,
      elapsedSeconds: this.getElapsedTime(),
      grid: this.grid.map(function (row) {
        return row.map(function (cell) {
          return {
            r: cell.row,
            c: cell.col,
            m: cell.isMine ? 1 : 0,
            rv: cell.revealed ? 1 : 0,
            f: cell.flagged ? 1 : 0,
            n: cell.neighborMines
          };
        });
      })
    };
  };

  ZenMines.deserialize = function (data) {
    if (!data || !data.grid) return null;
    var game = new ZenMines({
      difficulty: data.difficulty,
      rows: data.rows,
      cols: data.cols,
      mines: data.minesCount
    });

    game.status = data.status || 'ready';
    game.firstClick = !!data.firstClick;
    game.flagsPlaced = data.flagsPlaced || 0;
    game.revealedCount = data.revealedCount || 0;
    game.elapsedSeconds = data.elapsedSeconds || 0;

    game.grid = [];
    for (var r = 0; r < data.rows; r++) {
      var row = [];
      for (var c = 0; c < data.cols; c++) {
        var d = data.grid[r][c];
        row.push({
          row: d.r,
          col: d.c,
          isMine: d.m === 1,
          revealed: d.rv === 1,
          flagged: d.f === 1,
          neighborMines: d.n || 0,
          exploded: false,
          wrongFlag: false
        });
      }
      game.grid.push(row);
    }

    return game;
  };

  return ZenMines;
});
