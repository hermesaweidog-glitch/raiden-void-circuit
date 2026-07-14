import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUpgradeChoices, makeUpgradePool, updateGuidance } from '../src/systems.js';

test('upgrade choices are unique and omit maxed items', () => {
  const build = {
    primaryLevel: 5,
    secondaries: { homing: 5, drone: 2 },
    passives: { magnet: 5 },
    secondarySlots: 2,
    passiveSlots: 4,
  };
  const choices = makeUpgradeChoices(build, () => 0.42);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.ok(!choices.some(choice => ['primary', 'homing', 'magnet'].includes(choice.id)));
});

test('full equipment slots only offer upgrades for owned equipment', () => {
  const build = {
    primaryLevel: 5,
    secondaries: { homing: 2, rail: 1 },
    passives: { magnet: 1, armor: 2, critical: 1, engine: 3 },
    secondarySlots: 2,
    passiveSlots: 4,
  };
  const pool = makeUpgradePool(build);
  const secondaryIds = pool.filter(item => item.category === 'secondary').map(item => item.id);
  const passiveIds = pool.filter(item => item.category === 'passive').map(item => item.id);
  assert.deepEqual(new Set(secondaryIds), new Set(['homing', 'rail']));
  assert.deepEqual(new Set(passiveIds), new Set(['magnet', 'armor', 'critical', 'engine']));
});

test('homing missile never reacquires after target death', () => {
  const missile = { targetId: 7, guidanceActive: true, vx: 0, vy: -5, turn: 0.1 };
  const enemies = [{ id: 8, x: 120, y: 80, alive: true }];
  const result = updateGuidance(missile, enemies, { x: 100, y: 200 });
  assert.equal(result.guidanceActive, false);
  assert.equal(result.targetId, 7);
  assert.equal(result.vx, 0);
  assert.equal(result.vy, -5);
});

test('homing missile steers only toward its original live target', () => {
  const missile = { targetId: 7, guidanceActive: true, vx: 0, vy: -5, turn: 0.1 };
  const enemies = [
    { id: 7, x: 150, y: 100, alive: true },
    { id: 8, x: 20, y: 190, alive: true },
  ];
  const result = updateGuidance(missile, enemies, { x: 100, y: 200 });
  assert.equal(result.guidanceActive, true);
  assert.equal(result.targetId, 7);
  assert.ok(result.vx > 0);
});
