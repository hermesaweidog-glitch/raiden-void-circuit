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
  assert.match(html, /type="module" src="\.\/src\/main\.js\?v=55"/);
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

test('build strip uses two fixed rows with two primary, four secondary, and eight passive cells', () => {
  assert.match(css, /grid-template-areas:"primary secondary" "passive passive"/);
  assert.match(css, /nth-child\(1\)>span\{grid-template-columns:minmax\(88px,1\.35fr\) minmax\(0,\.65fr\)/);
  assert.match(css, /nth-child\(2\)>span\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /nth-child\(3\)>span\{grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
  assert.match(css, /skill-token\.empty/);
});

test('title page exposes the upgrade hangar, ore balance, and max mode toggle', () => {
  for (const id of ['hangar-button', 'hangar-overlay', 'hangar-upgrades', 'hangar-unlock-crafts', 'hangar-unlock-pilots', 'hangar-ore', 'meta-ore-balance', 'max-mode']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(main, /META_UPGRADES/);
  assert.match(main, /purchaseUpgrade/);
  assert.match(main, /purchaseUnlock/);
  assert.match(css, /\.hangar-overlay/);
  assert.match(css, /\.hangar-item/);
  const metaBarIndex = html.indexOf('title-meta-bar');
  const hangarButtonIndex = html.indexOf('hangar-button');
  const modeSelectIndex = html.indexOf('id="mode-select"');
  assert.ok(metaBarIndex < modeSelectIndex, 'ore wallet and max mode sit above the mode list');
  assert.ok(hangarButtonIndex < modeSelectIndex, 'the upgrade entry sits above the mode list');
  assert.match(html, /class="mode-card hangar-button"/, 'the upgrade entry shares the mode-card width');
});

test('aircraft and pilot selection are split into two dedicated enlarged steps', () => {
  for (const id of ['craft-step', 'pilot-step', 'craft-next', 'pilot-back']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(css, /\.aircraft-grid\{[^}]*grid-template-columns:1fr/);
  assert.match(css, /\.pilot-card i\{[^}]*flex:0 0 52px/);
  assert.match(css, /\.aircraft-card\.locked,\.pilot-card\.locked/);
});

test('HUD shows run ore before sector and styles it like the title wallet', () => {
  for (const id of ['ore', 'lives']) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  assert.match(html, /<small>ORE<\/small>/);
  assert.match(html, /class="hud-ore"/);
  assert.match(html, /<small>LIVES<\/small>/);
  const oreIndex = html.indexOf('<small>ORE</small>');
  const sectorIndex = html.indexOf('<small>SECTOR</small>');
  assert.ok(oreIndex > 0 && oreIndex < sectorIndex, 'ORE appears before SECTOR in the HUD');
  assert.match(css, /#ore|#ore\{|hud-ore/);
});

test('title shows version and exposes archive/codex from title and pause', () => {
  assert.match(html, /id=["']title-version["']/);
  assert.match(html, /ver\.55/);
  assert.match(html, /back-text-btn/);
  assert.match(html, />返回</);
  for (const id of ['codex-button', 'codex-overlay', 'codex-body', 'codex-back', 'pause-codex-button']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(main, /openCodex/);
  assert.match(main, /fromPause/);
  assert.match(css, /\.summary-ore/);
});

test('test options include the endless rules toggle', () => {
  assert.match(html, /id=["']test-endless["']/);
  assert.match(main, /test-endless/);
});
