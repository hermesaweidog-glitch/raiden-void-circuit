import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('page exposes complete desktop and mobile controls', () => {
  for (const id of ['game', 'aircraft-select', 'upgrade-overlay', 'bomb-button', 'pause-button', 'mute-button', 'end-overlay']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('page exposes a route bar with mandatory midboss and boss nodes', () => {
  for (const id of ['route-progress', 'route-label', 'route-status', 'route-fill', 'midboss-node', 'boss-node']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.doesNotMatch(html, /id=["']stage["']>1-1/);
  assert.match(html, /<small>SECTOR<\/small>/);
});

test('page is installable and loads modular entry point', () => {
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /type="module" src="\.\/src\/main\.js\?v=22"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(main, /class="aircraft-art"/);
  assert.match(main, /<i><img src="\$\{pilot\.art\}"/);
  assert.match(css, /\.pilot-card i img\{[^}]*width:100%[^}]*height:100%/);
});

test('pause overlay exposes the complete loadout without widening the game shell', () => {
  for (const id of ['pause-overlay', 'pause-primary', 'pause-secondary', 'pause-passive', 'pause-pilot', 'pause-fab', 'resume-button']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(css, /\.app-shell\{[^}]*width:min\(100%,520px\)[^}]*justify-self:center/);
  assert.match(css, /\.build-strip>div\{[^}]*min-width:0/);
  assert.match(css, /\.pause-loadout/);
});

test('title flow exposes normal, endless, and configurable test deployments', () => {
  for (const id of ['mode-select', 'loadout-select', 'aircraft-select', 'pilot-select', 'test-options', 'test-stage', 'test-secondaries', 'test-passives', 'test-player-invincible', 'test-enemies-immortal', 'deploy-button']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  for (const label of ['一般模式', '無限模式', '測試模式']) assert.match(main, new RegExp(label));
});

test('kungfu pilot swaps the test loadout to its dedicated martial catalog', () => {
  assert.match(main, /KUNGFU_SECONDARIES/);
  assert.match(main, /selectedPilot === 'kungfu'/);
  assert.match(main, /renderSecondaryOptions/);
});

test('HUD exposes three live DPS windows', () => {
  for (const id of ['dps-1s', 'dps-10s', 'dps-total']) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(css, /\.dps-strip/);
});

test('generated icons are centered and clipped inside their token frames', () => {
  assert.match(css, /\.build-strip \.skill-token\{[^}]*overflow:hidden/);
  assert.match(css, /\.skill-token i img\{[^}]*object-position:center[^}]*display:block/);
  assert.match(css, /\.upgrade-icon img\{[^}]*object-position:center[^}]*display:block/);
});

test('mobile build strip reserves enough compact space for all six passive icons', () => {
  assert.match(css, /\.build-strip\{[^}]*grid-template-columns:\.7fr minmax\(96px,1\.2fr\) 1\.7fr/);
  assert.match(css, /\.build-strip>div>span\{[^}]*flex-wrap:wrap[^}]*overflow:visible/);
  assert.match(css, /@media \(max-width:420px\)\{\.build-strip\{grid-template-columns:74px 88px minmax\(0,1fr\)/);
  assert.match(css, /@media \(max-width:420px\)[\s\S]*\.build-strip>div>span\{[^}]*flex-wrap:wrap[^}]*overflow:visible/);
  assert.doesNotMatch(css, /@media \(max-width:390px\)[^}]*\.build-strip>div:last-child\{display:none/);
});
