import { AIRCRAFT, BUILD_LIMITS, KUNGFU_SECONDARIES, PASSIVES, PILOTS, SECONDARIES } from './config.js';
import { Game } from './game.js';
import { isCraftUnlocked, isPilotUnlocked, loadMetaState, META_UNLOCKS, META_UPGRADES, purchaseUnlock, purchaseUpgrade, saveMetaState, upgradeCost } from './meta.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);
const aircraftSelect = document.querySelector('#aircraft-select');
const pilotSelect = document.querySelector('#pilot-select');
const modeSelect = document.querySelector('#mode-select');
const loadoutSelect = document.querySelector('#loadout-select');
const craftStep = document.querySelector('#craft-step');
const pilotStep = document.querySelector('#pilot-step');
const testOptions = document.querySelector('#test-options');
const hangarOverlay = document.querySelector('#hangar-overlay');
let selectedMode = 'normal';
let selectedCraft = 'falcon';
let selectedPilot = 'imperial';

const isMaxMode = () => document.querySelector('#max-mode').checked;

const MODES = [
  { id: 'normal', name: '一般模式', tag: 'CAMPAIGN', description: '五個戰區，逐步建立裝備並完成任務。' },
  { id: 'endless', name: '無限模式', tag: 'ENDLESS', description: '通過第五戰區後循環，敵人逐輪強化。', requiresClear: true },
  { id: 'test', name: '測試模式', tag: 'LAB', description: '自訂機體、駕駛、滿級武器、關卡與不死條件。' },
];

const isEndlessUnlocked = () => game.meta.cleared || isMaxMode();

const renderModeSelect = () => {
  modeSelect.innerHTML = `<small class="setup-label">SELECT MODE · 選擇遊戲模式</small><div class="mode-grid">${MODES.map(mode => {
    const locked = mode.requiresClear && !isEndlessUnlocked();
    return `
  <button class="mode-card${locked ? ' locked' : ''}" data-run-mode="${mode.id}" ${locked ? 'disabled' : ''}><small>${mode.tag}</small><b>${mode.name}</b><span>${locked ? '🔒 首次通關一般模式後解鎖。' : mode.description}</span></button>
`;
  }).join('')}</div>`;
  for (const button of modeSelect.querySelectorAll('[data-run-mode]')) button.addEventListener('click', () => showLoadout(button.dataset.runMode));
};

const renderAircraft = () => {
  const meta = isMaxMode() ? { unlocks: Object.keys(META_UNLOCKS) } : game.meta;
  aircraftSelect.innerHTML = Object.values(AIRCRAFT).map(craft => {
    const unlocked = isCraftUnlocked(meta, craft.id);
    return `
  <button class="aircraft-card${craft.id === selectedCraft ? ' selected' : ''}${unlocked ? '' : ' locked'}" data-craft="${craft.id}" ${unlocked ? '' : 'disabled'} style="--craft:${craft.color}">
    <img class="aircraft-art" src="${craft.art}" alt="${craft.name} ${craft.subtitle}" draggable="false"><strong>${craft.name}</strong><small>${craft.subtitle}</small><p>${unlocked ? craft.description : `🔒 需要 ◆${META_UNLOCKS[craft.id]?.cost ?? '—'} 解鎖`}</p>
  </button>`;
  }).join('');
  for (const button of aircraftSelect.querySelectorAll('[data-craft]')) button.addEventListener('click', () => {
    selectedCraft = button.dataset.craft;
    selectCard(aircraftSelect, 'data-craft', selectedCraft);
  });
};

const renderPilots = () => {
  const meta = isMaxMode() ? { unlocks: Object.keys(META_UNLOCKS) } : game.meta;
  pilotSelect.innerHTML = Object.values(PILOTS).map(pilot => {
    const unlocked = isPilotUnlocked(meta, pilot.id);
    return `
  <button class="pilot-card${pilot.id === selectedPilot ? ' selected' : ''}${unlocked ? '' : ' locked'}" data-pilot="${pilot.id}" ${unlocked ? '' : 'disabled'}><i><img src="${pilot.art}" alt="" draggable="false"></i><span><strong>${pilot.name}</strong><small>${unlocked ? `${pilot.subtitle} · ${pilot.ability}` : `🔒 需要 ◆${META_UNLOCKS[pilot.id]?.cost ?? '—'} 解鎖`}</small></span></button>`;
  }).join('');
  for (const button of pilotSelect.querySelectorAll('[data-pilot]')) button.addEventListener('click', () => {
    selectedPilot = button.dataset.pilot;
    selectCard(pilotSelect, 'data-pilot', selectedPilot);
    renderSecondaryOptions();
    renderPassiveOptions();
    syncTestLimits();
  });
  if (!isPilotUnlocked(meta, selectedPilot)) { selectedPilot = 'imperial'; selectCard(pilotSelect, 'data-pilot', selectedPilot); }
};

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

const testMeta = () => isMaxMode() ? { firepower: 10, fuelTank: 5, lives: 1, bombPants: 1, secondarySlot: 1, passiveSlot: 2, oreGain: 10, xpGain: 3 } : game.meta.upgrades;

const syncTestLimits = () => {
  const bonus = selectedPilot === 'joker' ? 1 : 0;
  const upgrades = testMeta();
  const secondaryLimit = 2 + (upgrades.secondarySlot ?? 0) + bonus;
  const passiveLimit = 4 + (upgrades.passiveSlot ?? 0) + bonus + (AIRCRAFT[selectedCraft]?.passiveSlotBonus || 0);
  for (const [name, limit, countId] of [['test-secondary', secondaryLimit, 'test-secondary-count'], ['test-passive', passiveLimit, 'test-passive-count']]) {
    const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
    inputs.filter(input => input.checked).slice(limit).forEach(input => { input.checked = false; });
    const count = inputs.filter(input => input.checked).length;
    for (const input of inputs) input.disabled = !input.checked && count >= limit;
    document.querySelector(`#${countId}`).textContent = `${count} / ${limit}`;
  }
};
document.querySelector('#test-secondaries').addEventListener('change', syncTestLimits);
document.querySelector('#test-passives').addEventListener('change', syncTestLimits);

const selectCard = (container, attribute, value) => {
  for (const button of container.querySelectorAll(`[${attribute}]`)) button.classList.toggle('selected', button.getAttribute(attribute) === value);
};

const refreshOreBalance = () => {
  document.querySelector('#meta-ore-balance').textContent = `◆ ${game.meta.ore}`;
};

const showModeSelect = () => {
  game.meta = loadMetaState();
  renderModeSelect();
  modeSelect.classList.remove('hidden');
  loadoutSelect.classList.add('hidden');
  hangarOverlay.classList.add('hidden');
  document.querySelector('.title-meta-bar').classList.remove('hidden');
  document.querySelector('#hangar-button').classList.remove('hidden');
  document.querySelector('#title-overlay').classList.remove('setup-open');
  refreshOreBalance();
};

const showLoadout = mode => {
  selectedMode = mode;
  document.querySelector('#setup-mode-title').textContent = MODES.find(item => item.id === mode)?.name || '一般模式';
  modeSelect.classList.add('hidden');
  document.querySelector('.title-meta-bar').classList.add('hidden');
  document.querySelector('#hangar-button').classList.add('hidden');
  loadoutSelect.classList.remove('hidden');
  craftStep.classList.remove('hidden');
  pilotStep.classList.add('hidden');
  testOptions.classList.toggle('hidden', mode !== 'test');
  document.querySelector('#title-overlay').classList.add('setup-open');
  renderAircraft();
};

const showPilotStep = () => {
  craftStep.classList.add('hidden');
  pilotStep.classList.remove('hidden');
  renderPilots();
  renderSecondaryOptions();
  renderPassiveOptions();
  syncTestLimits();
};

// --- Hangar (meta shop) ----------------------------------------------------
const renderHangar = () => {
  document.querySelector('#hangar-ore').textContent = `◆ ${game.meta.ore}`;
  const upgradeHolder = document.querySelector('#hangar-upgrades');
  upgradeHolder.innerHTML = Object.values(META_UPGRADES).map(def => {
    const rank = game.meta.upgrades[def.id] ?? 0;
    const cost = upgradeCost(def.id, rank);
    const maxed = cost === null;
    const affordable = !maxed && game.meta.ore >= cost;
    return `<button class="hangar-item${maxed ? ' maxed' : affordable ? '' : ' unaffordable'}" data-upgrade="${def.id}" ${maxed || !affordable ? 'disabled' : ''}>
      <strong>${def.name}</strong><small>${def.describe(rank)} → ${maxed ? 'MAX' : def.describe(rank + 1)}</small>
      <b>${maxed ? 'MAX' : `◆ ${cost}`}</b><span class="hangar-rank">${rank}/${def.max}</span>
    </button>`;
  }).join('');
  for (const button of upgradeHolder.querySelectorAll('[data-upgrade]')) button.addEventListener('click', () => {
    if (purchaseUpgrade(game.meta, button.dataset.upgrade)) { saveMetaState(game.meta); renderHangar(); refreshOreBalance(); }
  });
  const renderUnlockList = (holder, kind) => {
    holder.innerHTML = Object.values(META_UNLOCKS).filter(def => def.kind === kind).map(def => {
      const owned = game.meta.unlocks.includes(def.id);
      const affordable = !owned && game.meta.ore >= def.cost;
      return `<button class="hangar-item${owned ? ' maxed' : affordable ? '' : ' unaffordable'}" data-unlock="${def.id}" ${owned || !affordable ? 'disabled' : ''}>
      <strong>${def.name}</strong><small>${kind === 'craft' ? '機體' : '駕駛員'}解鎖</small>
      <b>${owned ? '已解鎖' : `◆ ${def.cost}`}</b>
    </button>`;
    }).join('');
    for (const button of holder.querySelectorAll('[data-unlock]')) button.addEventListener('click', () => {
      if (purchaseUnlock(game.meta, button.dataset.unlock)) { saveMetaState(game.meta); renderHangar(); refreshOreBalance(); }
    });
  };
  renderUnlockList(document.querySelector('#hangar-unlock-crafts'), 'craft');
  renderUnlockList(document.querySelector('#hangar-unlock-pilots'), 'pilot');
};

document.querySelector('#hangar-button').addEventListener('click', () => {
  hangarOverlay.classList.remove('hidden');
  renderHangar();
});
document.querySelector('#hangar-back').addEventListener('click', () => hangarOverlay.classList.add('hidden'));
document.querySelector('#max-mode').addEventListener('change', () => { renderModeSelect(); renderAircraft(); });

// Reset meta progress: two-step confirmation on the same button.
const resetButton = document.querySelector('#reset-meta');
let resetArmed = false;
let resetTimer = 0;
resetButton.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetButton.textContent = '確認重置？';
    resetButton.classList.add('confirming');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      resetButton.textContent = '重置進度';
      resetButton.classList.remove('confirming');
    }, 4000);
    return;
  }
  clearTimeout(resetTimer);
  resetArmed = false;
  resetButton.textContent = '重置進度';
  resetButton.classList.remove('confirming');
  try { localStorage.removeItem('void-circuit-meta'); } catch { /* storage unavailable */ }
  game.meta = loadMetaState();
  showModeSelect();
});

document.querySelector('#craft-next').addEventListener('click', showPilotStep);
document.querySelector('#pilot-back').addEventListener('click', () => {
  pilotStep.classList.add('hidden');
  craftStep.classList.remove('hidden');
  renderAircraft();
});

document.querySelector('#setup-back').addEventListener('click', showModeSelect);
document.querySelector('#deploy-button').addEventListener('click', () => {
  const values = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  game.start({
    runMode: selectedMode,
    craftId: selectedCraft,
    pilotId: selectedPilot,
    maxMode: isMaxMode(),
    startStage: Number(document.querySelector('#test-stage').value),
    startAtBoss: selectedMode === 'test' && document.querySelector('#test-start-boss').checked,
    endless: selectedMode === 'test' && document.querySelector('#test-endless').checked,
    secondaries: selectedMode === 'test' ? values('test-secondary') : [],
    passives: selectedMode === 'test' ? values('test-passive') : [],
    playerInvincible: selectedMode === 'test' && document.querySelector('#test-player-invincible').checked,
    enemiesImmortal: selectedMode === 'test' && document.querySelector('#test-enemies-immortal').checked,
  });
});
game.onShowTitle = showModeSelect;
renderModeSelect();
refreshOreBalance();

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
