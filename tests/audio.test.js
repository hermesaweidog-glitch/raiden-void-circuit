import test from 'node:test';
import assert from 'node:assert/strict';

class FakeAudio {
  static instances = [];
  static rejectFirstFor = '';

  constructor(src) {
    this.src = src;
    this.preload = '';
    this.loop = false;
    this.volume = 1;
    this.muted = false;
    this.paused = true;
    this.currentTime = 0;
    this.playCalls = 0;
    this.listeners = new Map();
    FakeAudio.instances.push(this);
  }

  setAttribute() {}
  load() {}
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  pause() { this.paused = true; }
  play() {
    this.playCalls += 1;
    if (FakeAudio.rejectFirstFor && this.src.includes(FakeAudio.rejectFirstFor) && this.playCalls === 1) {
      return Promise.reject(new Error('autoplay blocked'));
    }
    this.paused = false;
    return Promise.resolve();
  }
}

globalThis.Audio = FakeAudio;
const { MusicController } = await import('../src/audio.js');
const flushPromises = async () => { await Promise.resolve(); await Promise.resolve(); };

test('first user gesture starts the prepared menu and primes later music tracks', async () => {
  FakeAudio.instances = [];
  FakeAudio.rejectFirstFor = '';
  const music = new MusicController();
  music.fade = (track, target) => { track.audio.volume = target; };
  music.prepare('menu');

  music.unlock();
  await flushPromises();

  const menu = FakeAudio.instances.find(audio => audio.src.includes('/menu.mp3'));
  assert.equal(menu.playCalls, 1);
  assert.equal(menu.paused, false);
  for (const audio of FakeAudio.instances.filter(item => item !== menu)) {
    assert.equal(audio.playCalls, 1, `${audio.src} should be primed during the gesture`);
  }
});

test('a blocked first play remains queued and succeeds on the next gesture', async () => {
  FakeAudio.instances = [];
  FakeAudio.rejectFirstFor = 'menu.mp3';
  const music = new MusicController();
  music.fade = (track, target) => { track.audio.volume = target; };
  music.prepare('menu');

  music.unlock();
  await flushPromises();
  assert.equal(music.unlocked, false);

  music.unlock();
  await flushPromises();
  const menu = FakeAudio.instances.find(audio => audio.src.includes('/menu.mp3'));
  assert.equal(menu.playCalls, 2);
  assert.equal(menu.paused, false);
  assert.equal(music.unlocked, true);
});
