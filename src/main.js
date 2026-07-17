import { AIRCRAFT, BUILD_LIMITS, KUNGFU_SECONDARIES, PASSIVES, PILOTS, SECONDARIES } from './config.js';
import { Game } from './game.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
const aircraftSelect = document.querySelector('#aircraft-select');
const pilotSelect = document.querySelector('#pilot-select');
const modeSelect = document.querySelector('#mode-select');
const loadoutSelect = document.querySelector('#loadout-select');
const testOptions = document.querySelector('#test-options');
let selectedMode = 'normal';
let selectedCraft = 'falcon';
let selectedPilot = 'imperial';

const MODES = [
  { id: 'normal', name: '一般模式', tag: 'CAMPAIGN', description: '五個戰區，逐步建立裝備並完成任務。' },
  { id: 'endless', name: '無限模式', tag: 'ENDLESS', description: '通過第五戰區後循環，敵人逐輪強化。' },
  { id: 'test', name: '測試模式', tag: 'LAB', description: '自訂機體、駕駛、滿級武器、關卡與不死條件。' },
];

modeSelect.innerHTML = `<small class="setup-label">SELECT MODE · 選擇遊戲模式</small><div class="mode-grid">${MODES.map(mode => `
  <button class="mode-card" data-run-mode="${mode.id}"><small>${mode.tag}</small><b>${mode.name}</b><span>${mode.description}</span></button>
`).join('')}</div>`;

aircraftSelect.innerHTML = Object.values(AIRCRAFT).map(craft => `
  <button class="aircraft-card${craft.id === selectedCraft ? ' selected' : ''}" data-craft="${craft.id}" style="--craft:${craft.color}">
    <img class="aircraft-art" src="${craft.art}" alt="${craft.name} ${craft.subtitle}" draggable="false"><strong>${craft.name}</strong><small>${craft.subtitle}</small><p>${craft.description}</p>
  </button>
`).join('');

pilotSelect.innerHTML = Object.values(PILOTS).map(pilot => `
  <button class="pilot-card${pilot.id === selectedPilot ? ' selected' : ''}" data-pilot="${pilot.id}"><i><img src="${pilot.art}" alt="" draggable="false"></i><span><strong>${pilot.name}</strong><small>${pilot.subtitle} · ${pilot.ability}</small></span></button>
`).join('');

const testChips = (catalog, name) => Object.values(catalog).map(item => `
  <label><input type="checkbox" name="${name}" value="${item.id}"><span>${item.name}</span></label>
`).join('');
const renderSecondaryOptions = () => {
  const holder = document.querySelector('#test-secondaries');
  const selected = new Set([...holder.querySelectorAll('input:checked')].map(input => input.value));
  const catalog = selectedPilot === 'kungfu' ? KUNGFU_SECONDARIES : SECONDARIES;
  holder.innerHTML = testChips(catalog, 'test-secondary');
  for (const input of holder.querySelectorAll('input')) input.checked = selected.has(input.value);
};
const renderPassiveOptions = () => {
  const holder = document.querySelector('#test-passives');
  const selected = new Set([...holder.querySelectorAll('input:checked')].map(input => input.value));
  const catalog = selectedPilot === 'kungfu' ? Object.fromEntries(Object.entries(PASSIVES).filter(([id]) => id !== 'guidance')) : PASSIVES;
  holder.innerHTML = testChips(catalog, 'test-passive');
  for (const input of holder.querySelectorAll('input')) input.checked = selected.has(input.value);
};

const syncTestLimits = () => {
  const bonus = selectedPilot === 'joker' ? 1 : 0;
  for (const [name, baseLimit, countId] of [['test-secondary', BUILD_LIMITS.secondary, 'test-secondary-count'], ['test-passive', BUILD_LIMITS.passive, 'test-passive-count']]) {
    const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
    const limit = baseLimit + bonus;
    inputs.filter(input => input.checked).slice(limit).forEach(input => { input.checked = false; });
    const count = inputs.filter(input => input.checked).length;
    for (const input of inputs) input.disabled = !input.checked && count >= limit;
    document.querySelector(`#${countId}`).textContent = `${count} / ${limit}`;
  }
};
document.querySelector('#test-secondaries').addEventListener('change', syncTestLimits);
document.querySelector('#test-passives').addEventListener('change', syncTestLimits);
renderSecondaryOptions();
renderPassiveOptions();
syncTestLimits();

const selectCard = (container, attribute, value) => {
  for (const button of container.querySelectorAll(`[${attribute}]`)) button.classList.toggle('selected', button.getAttribute(attribute) === value);
};

const showModeSelect = () => {
  modeSelect.classList.remove('hidden');
  loadoutSelect.classList.add('hidden');
  document.querySelector('#title-overlay').classList.remove('setup-open');
};

const showLoadout = mode => {
  selectedMode = mode;
  document.querySelector('#setup-mode-title').textContent = MODES.find(item => item.id === mode)?.name || '一般模式';
  modeSelect.classList.add('hidden');
  loadoutSelect.classList.remove('hidden');
  testOptions.classList.toggle('hidden', mode !== 'test');
  document.querySelector('#title-overlay').classList.add('setup-open');
};

for (const button of modeSelect.querySelectorAll('[data-run-mode]')) button.addEventListener('click', () => showLoadout(button.dataset.runMode));
for (const button of aircraftSelect.querySelectorAll('[data-craft]')) button.addEventListener('click', () => {
  selectedCraft = button.dataset.craft;
  selectCard(aircraftSelect, 'data-craft', selectedCraft);
});
for (const button of pilotSelect.querySelectorAll('[data-pilot]')) button.addEventListener('click', () => {
  selectedPilot = button.dataset.pilot;
  selectCard(pilotSelect, 'data-pilot', selectedPilot);
  renderSecondaryOptions();
  renderPassiveOptions();
  syncTestLimits();
});

document.querySelector('#setup-back').addEventListener('click', showModeSelect);
document.querySelector('#deploy-button').addEventListener('click', () => {
  const values = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  game.start({
    runMode: selectedMode,
    craftId: selectedCraft,
    pilotId: selectedPilot,
    startStage: Number(document.querySelector('#test-stage').value),
    startAtBoss: selectedMode === 'test' && document.querySelector('#test-start-boss').checked,
    secondaries: selectedMode === 'test' ? values('test-secondary') : [],
    passives: selectedMode === 'test' ? values('test-passive') : [],
    playerInvincible: selectedMode === 'test' && document.querySelector('#test-player-invincible').checked,
    enemiesImmortal: selectedMode === 'test' && document.querySelector('#test-enemies-immortal').checked,
  });
});
game.onShowTitle = showModeSelect;

document.querySelector('#bomb-button').addEventListener('pointerdown', event => {
  event.preventDefault();
  event.stopPropagation();
  game.useBomb();
});
document.querySelector('#pause-button').addEventListener('click', () => game.togglePause());
document.querySelector('#pause-fab').addEventListener('click', () => game.togglePause());
document.querySelector('#resume-button').addEventListener('click', () => game.togglePause());
document.querySelector('#title-button').addEventListener('click', () => game.showTitle());
for (const [id, flag] of [['pause-player-invincible', 'playerInvincible'], ['pause-enemies-immortal', 'enemiesImmortal']]) {
  document.querySelector(`#${id}`).addEventListener('change', event => game.setTestFlag(flag, event.target.checked));
}
document.querySelector('#mute-button').addEventListener('click', () => game.toggleMute());
document.querySelector('#retry-button').addEventListener('click', () => game.restart());

window.raidenGame = {
  start: id => game.start(id || 'falcon'),
  getState: () => game.debugState(),
  bomb: () => game.useBomb(),
  grantXp: amount => game.grantXp(amount),
  forceBoss: () => game.debugForceBoss(),
  forceStage: stage => game.debugForceStage(stage),
  game,
};

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
