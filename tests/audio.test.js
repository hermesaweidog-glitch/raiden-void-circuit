import test from 'node:test';
import assert from 'node:assert/strict';

class FakeAudio {
  static instances = [];
  static rejectFirstFor = '';

  constructor(src = '') {
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

test('music uses one persistent media element across menu, stage, warning, and boss scenes', async () => {
  FakeAudio.instances = [];
  FakeAudio.rejectFirstFor = '';
  const music = new MusicController();
  music.fade = (target, _duration, stopAtEnd = false, onComplete = null) => {
    music.audio.volume = target;
    if (stopAtEnd && target <= 0) music.audio.pause();
    onComplete?.();
  };
  music.prepare('menu');

  music.unlock();
  await flushPromises();
  assert.equal(FakeAudio.instances.length, 1);
  assert.match(music.audio.src, /menu\.mp3/);
  assert.equal(music.audio.paused, false);

  music.scene('stage');
  assert.match(music.audio.src, /stage\.mp3/);
  music.scene('warning');
  assert.match(music.audio.src, /boss-warning\.mp3/);
  music.scene('boss');
  assert.match(music.audio.src, /boss\.mp3/);
  assert.equal(FakeAudio.instances.length, 1);
});

test('a blocked first play remains queued and succeeds on the next gesture', async () => {
  FakeAudio.instances = [];
  FakeAudio.rejectFirstFor = 'menu.mp3';
  const music = new MusicController();
  music.fade = (target) => { music.audio.volume = target; };
  music.prepare('menu');

  music.unlock();
  await flushPromises();
  assert.equal(music.unlocked, false);

  music.unlock();
  await flushPromises();
  assert.equal(music.audio.playCalls, 2);
  assert.equal(music.audio.paused, false);
  assert.equal(music.unlocked, true);
});
