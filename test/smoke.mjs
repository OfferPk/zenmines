// Headless browser smoke test for ZenMines (www/ build).
// Uses playwright-core with a system Chrome/Chromium (set CHROME_PATH to override).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = candidates.find(p => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.error('  ✗', msg); } };

async function run(label, viewport, isMobile) {
  console.log(`\n[${label}] ${viewport.width}x${viewport.height}`);
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  ok(await page.isVisible('#menu-screen'), 'main menu visible on launch');
  ok(await page.isHidden('#menu-continue'), 'no Continue button on fresh install');

  // Classic beginner
  await page.click('.menu-diff [data-diff="beginner"]');
  ok(await page.isHidden('#menu-screen'), 'menu hides when starting a game');
  ok((await page.textContent('#mode-label')).includes('Beginner'), 'mode label shows Beginner');
  ok(await page.locator('#board-grid .cell').count() === 81, 'beginner board has 81 cells');
  await page.click('#board-grid .cell >> nth=40');
  const revealed = await page.locator('#board-grid .cell.revealed').count();
  ok(revealed >= 9, `first tap is safe and opens area (${revealed} revealed)`);
  const status = await page.evaluate(() => ZenMinesApp.getGame().status);
  ok(status === 'playing' || status === 'won', 'game status playing after first tap');

  if (status === 'playing') {
    // Pause / resume
    await page.click('#pause-btn');
    ok(await page.isVisible('#pause-modal'), 'pause dialog opens');
    ok(await page.evaluate(() => document.body.classList.contains('is-paused') && ZenMinesApp.getGame().isPaused()), 'board hidden and clock paused');
    await page.click('#pause-resume');
    ok(await page.isHidden('#pause-modal') && !(await page.evaluate(() => ZenMinesApp.getGame().isPaused())), 'resume closes dialog and restarts clock');

    // Saved game + Continue
    const saved = await page.evaluate(() => !!localStorage.getItem('zenmines_saved'));
    ok(saved, 'in-progress board saved to localStorage');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(200);
    ok(await page.isVisible('#menu-continue'), 'Continue offered after reload');
    await page.click('#menu-continue');
    ok(await page.locator('#board-grid .cell.revealed').count() >= revealed, 'Continue restores the board');

    // Lose: click a hidden mine
    const mineIdx = await page.evaluate(() => {
      const g = ZenMinesApp.getGame();
      for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (g.grid[r][c].isMine && !g.grid[r][c].flagged) return r * g.cols + c;
      return -1;
    });
    await page.click(`#board-grid .cell >> nth=${mineIdx}`);
    await page.waitForSelector('#result-modal.open', { timeout: 4000 });
    ok((await page.textContent('#result-title')).includes('Game over'), 'game over dialog after hitting a mine');
    ok(await page.isHidden('#result-next'), 'no Next button in classic mode');
    await page.click('#result-retry');
    ok(await page.evaluate(() => ZenMinesApp.getGame().status === 'ready'), 'Try again starts a fresh board');
    ok(await page.evaluate(() => !localStorage.getItem('zenmines_saved')), 'saved board cleared after game over');
  }

  if (isMobile) {
    await page.tap('#board-grid .cell >> nth=40');
    ok(await page.locator('#board-grid .cell.revealed').count() >= 9, 'touch tap reveals cells');
  }

  // Settings
  await page.click('#settings-btn');
  ok(await page.isVisible('#settings-modal'), 'settings open');
  await page.click('label:has(#set-sound)');
  ok(await page.evaluate(() => localStorage.getItem('zenmines_sound') === '0'), 'sound toggle persists (off)');
  ok((await page.textContent('#sound-toggle')).includes('🔇'), 'header sound icon reflects mute');
  await page.selectOption('#set-theme', 'light');
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'light'), 'theme switch applies');
  await page.click('#settings-modal .modal-footer .close-modal-btn');
  ok(await page.isHidden('#settings-modal'), 'settings close');

  // Journey: win stage 1 by revealing every safe cell
  await page.evaluate(() => ZenMinesApp.showMenu());
  await page.click('#menu-journey');
  ok(await page.locator('#journey-grid .stage-btn').count() === 24, 'journey lists 24 stages');
  ok(await page.locator('#journey-grid .stage-btn.locked').count() === 23, 'only stage 1 unlocked initially');
  await page.click('#journey-grid .stage-btn >> nth=0');
  ok((await page.textContent('#mode-label')).includes('Stage 1'), 'stage 1 started');
  await page.click('#board-grid .cell >> nth=14');
  for (let guard = 0; guard < 60; guard++) {
    const idx = await page.evaluate(() => {
      const g = ZenMinesApp.getGame();
      if (g.status !== 'playing') return -1;
      for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) { const x = g.grid[r][c]; if (!x.isMine && !x.revealed) return r * g.cols + c; }
      return -1;
    });
    if (idx < 0) break;
    await page.click(`#board-grid .cell >> nth=${idx}`);
  }
  await page.waitForSelector('#result-modal.open', { timeout: 4000 });
  ok((await page.textContent('#result-title')).includes('cleared'), 'win dialog shown');
  ok(await page.isVisible('#result-next'), 'Next stage button offered');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('zenmines_progress')).unlocked === 2), 'stage 2 unlocked in localStorage');
  await page.click('#result-next');
  ok((await page.textContent('#mode-label')).includes('Stage 2'), 'Next stage loads stage 2');

  // Stats reflect games
  await page.click('#stats-btn');
  const played = parseInt(await page.textContent('#stat-played'), 10);
  ok(played >= 1, `stats recorded (${played} played)`);
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#stats-modal'), 'Escape closes dialog');

  // Expert board must fit or scroll without breaking layout
  await page.evaluate(() => ZenMinesApp.startSession({ mode: 'classic', difficulty: 'expert' }));
  ok(await page.locator('#board-grid .cell').count() === 480, 'expert board has 480 cells');
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflowX, 'no horizontal page overflow on expert');

  ok(errors.length === 0, 'no console errors/warnings' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

try {
  await run('mobile', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1280, height: 860 }, false);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\nSMOKE FAILED: ${failures} check(s)` : '\nSMOKE PASSED');
process.exit(failures ? 1 : 0);
