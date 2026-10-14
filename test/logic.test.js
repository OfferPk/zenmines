/**
 * ZenMines - Logic Unit Tests
 * Uses Node's built-in assert module for clean, zero-dependency testing.
 */

const assert = require('assert');
const ZenMines = require('../src/logic.js');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('Running ZenMines Logic Tests...\n');

// 1. Initialization and presets
test('Initializes with default beginner preset (9x9, 10 mines)', () => {
  const game = new ZenMines();
  assert.strictEqual(game.rows, 9);
  assert.strictEqual(game.cols, 9);
  assert.strictEqual(game.minesCount, 10);
  assert.strictEqual(game.status, 'ready');
  assert.strictEqual(game.firstClick, true);
  assert.strictEqual(game.flagsPlaced, 0);
  assert.strictEqual(game.revealedCount, 0);
  assert.strictEqual(game.grid.length, 9);
  assert.strictEqual(game.grid[0].length, 9);
});

test('Initializes with intermediate preset (16x16, 40 mines)', () => {
  const game = new ZenMines({ difficulty: 'intermediate' });
  assert.strictEqual(game.rows, 16);
  assert.strictEqual(game.cols, 16);
  assert.strictEqual(game.minesCount, 40);
  assert.strictEqual(game.safeCells, 16 * 16 - 40);
});

test('Initializes with expert preset (16x30, 99 mines)', () => {
  const game = new ZenMines({ difficulty: 'expert' });
  assert.strictEqual(game.rows, 16);
  assert.strictEqual(game.cols, 30);
  assert.strictEqual(game.minesCount, 99);
  assert.strictEqual(game.safeCells, 16 * 30 - 99);
});

test('Enforces bounds on custom grid and mines', () => {
  const game = new ZenMines({ rows: 2, cols: 100, mines: 9999 });
  assert.strictEqual(game.rows, 4); // clamped min 4
  assert.strictEqual(game.cols, 50); // clamped max 50
  assert.ok(game.minesCount <= game.rows * game.cols - 1);
});

// 2. Safe first click & mine placement
test('Guarantees safe first click and safe 3x3 surrounding zone', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = new ZenMines({ seed: seed });
    const res = game.reveal(4, 4);
    assert.strictEqual(res.changed, true);
    assert.strictEqual(game.status === 'playing' || game.status === 'won', true);
    assert.strictEqual(game.firstClick, false);

    // Clicked cell must never be a mine
    assert.strictEqual(game.grid[4][4].isMine, false);
    assert.strictEqual(game.grid[4][4].revealed, true);

    // Neighbors around (4,4) must not be mines
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = 4 + dr;
        const c = 4 + dc;
        assert.strictEqual(game.grid[r][c].isMine, false, `Cell at (${r},${c}) should not be a mine`);
      }
    }
  }
});

test('Mine count on board matches configured minesCount exactly', () => {
  const game = new ZenMines({ difficulty: 'beginner', seed: 42 });
  game.reveal(0, 0);
  let actualMines = 0;
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c].isMine) actualMines++;
    }
  }
  assert.strictEqual(actualMines, 10);
});

// 3. Flood fill & number indicators
test('Flood fills 0-neighbor cells to open an expanse', () => {
  const game = new ZenMines({ seed: 100 });
  const res = game.reveal(4, 4);
  assert.ok(res.revealedCells.length >= 9, 'Should reveal at least the 3x3 safe neighborhood');
  for (const cell of res.revealedCells) {
    assert.strictEqual(cell.revealed, true);
    assert.strictEqual(cell.isMine, false);
  }
});

// 4. Flagging
test('Toggles flags correctly and tracks remaining mines counter', () => {
  const game = new ZenMines({ seed: 7 });
  assert.strictEqual(game.getRemainingMines(), 10);

  const res1 = game.toggleFlag(2, 3);
  assert.strictEqual(res1.changed, true);
  assert.strictEqual(res1.flagged, true);
  assert.strictEqual(game.flagsPlaced, 1);
  assert.strictEqual(game.getRemainingMines(), 9);

  // Unflag
  const res2 = game.toggleFlag(2, 3);
  assert.strictEqual(res2.changed, true);
  assert.strictEqual(res2.flagged, false);
  assert.strictEqual(game.flagsPlaced, 0);
  assert.strictEqual(game.getRemainingMines(), 10);
});

test('Cannot reveal a flagged cell', () => {
  const game = new ZenMines({ seed: 7 });
  game.toggleFlag(1, 1);
  const res = game.reveal(1, 1);
  assert.strictEqual(res.changed, false);
  assert.strictEqual(game.grid[1][1].revealed, false);
});

test('Cannot flag an already revealed cell', () => {
  const game = new ZenMines({ seed: 7 });
  game.reveal(4, 4);
  const res = game.toggleFlag(4, 4);
  assert.strictEqual(res.changed, false);
  assert.strictEqual(game.grid[4][4].flagged, false);
});

// 5. Loss condition
test('Hitting a mine results in loss, reveals all mines, marks wrong flags', () => {
  const game = new ZenMines({ seed: 10 });
  game.reveal(0, 0); // initial safe click

  // Find a mine cell
  let mineRow = -1;
  let mineCol = -1;
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c].isMine) {
        mineRow = r;
        mineCol = c;
        break;
      }
    }
    if (mineRow !== -1) break;
  }

  // Intentionally flag an innocent cell to test wrongFlag detection
  let safeRow = -1;
  let safeCol = -1;
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (!game.grid[r][c].isMine && !game.grid[r][c].revealed) {
        safeRow = r;
        safeCol = c;
        break;
      }
    }
    if (safeRow !== -1) break;
  }
  game.toggleFlag(safeRow, safeCol);

  // Click the mine
  const res = game.reveal(mineRow, mineCol);
  assert.strictEqual(res.status, 'lost');
  assert.strictEqual(game.status, 'lost');
  assert.strictEqual(game.grid[mineRow][mineCol].exploded, true);
  assert.strictEqual(game.grid[safeRow][safeCol].wrongFlag, true);
});

// 6. Win condition
test('Revealing all safe cells results in win and auto-flags mines', () => {
  const game = new ZenMines({ rows: 4, cols: 4, mines: 2, seed: 123 });
  game.reveal(0, 0);

  // Reveal every remaining safe cell
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (!game.grid[r][c].isMine && !game.grid[r][c].revealed) {
        game.reveal(r, c);
      }
    }
  }

  assert.strictEqual(game.status, 'won');
  // Check that all mines are auto-flagged
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c].isMine) {
        assert.strictEqual(game.grid[r][c].flagged, true);
      }
    }
  }
});

// 7. Chording
test('Chording reveals unflagged neighbors when flagged count matches number', () => {
  const game = new ZenMines({ seed: 99 });
  game.reveal(4, 4);

  // Find a revealed cell with neighborMines === 1
  let target = null;
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c].revealed && game.grid[r][c].neighborMines === 1) {
        target = game.grid[r][c];
        break;
      }
    }
    if (target) break;
  }

  if (target) {
    // Flag the mine neighbor
    let flaggedNeighbor = false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = target.row + dr;
        const nc = target.col + dc;
        if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) {
          if (game.grid[nr][nc].isMine) {
            game.toggleFlag(nr, nc);
            flaggedNeighbor = true;
            break;
          }
        }
      }
      if (flaggedNeighbor) break;
    }

    if (flaggedNeighbor) {
      const chordRes = game.chord(target.row, target.col);
      assert.strictEqual(chordRes.changed, true);
      assert.strictEqual(chordRes.status !== 'lost', true);
    }
  }
});

// 8. Hint system
test('Generates valid hint when available', () => {
  const game = new ZenMines({ rows: 5, cols: 5, mines: 3, seed: 5 });
  game.reveal(2, 2);
  const hint = game.getHint();
  if (hint) {
    assert.ok(['flag', 'reveal'].includes(hint.action));
    assert.ok(hint.row >= 0 && hint.row < game.rows);
    assert.ok(hint.col >= 0 && hint.col < game.cols);
    assert.ok(typeof hint.reason === 'string');
  }
});

// 9. Serialization and deserialization
test('Serializes and restores game state accurately', () => {
  const game1 = new ZenMines({ seed: 55 });
  game1.reveal(3, 3);
  game1.toggleFlag(0, 0);

  const serialized = game1.serialize();
  const game2 = ZenMines.deserialize(serialized);

  assert.strictEqual(game2.rows, game1.rows);
  assert.strictEqual(game2.cols, game1.cols);
  assert.strictEqual(game2.minesCount, game1.minesCount);
  assert.strictEqual(game2.status, game1.status);
  assert.strictEqual(game2.flagsPlaced, game1.flagsPlaced);
  assert.strictEqual(game2.grid[3][3].revealed, true);
  assert.strictEqual(game2.grid[0][0].flagged, true);
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.\n`);
if (passedTests !== totalTests) {
  process.exit(1);
}
