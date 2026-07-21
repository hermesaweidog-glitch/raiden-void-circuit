const now = () => globalThis.performance?.now?.() ?? Date.now();

export const MUSIC_SCENES = Object.freeze({
  menu: { src: './assets/audio/menu.mp3', loop: true, volume: .46 },
  stage: { src: './assets/audio/stage.mp3', loop: true, volume: .52 },
  warning: { src: './assets/audio/boss-warning.mp3', loop: false, volume: .82 },
  boss: { src: './assets/audio/boss.mp3', loop: true, volume: .58 },
});

export class MusicController {
  constructor({ muted = false } = {}) {
    this.muted = Boolean(muted);
    this.unlocked = false;
    this.pausedByGame = false;
    this.currentKey = null;
    this.desiredKey = null;
    this.tracks = Object.fromEntries(Object.entries(MUSIC_SCENES).map(([key, definition]) => [key, this.createTrack(key, definition)]));
  }

  createTrack(key, definition) {
    if (typeof globalThis.Audio !== 'function') return null;
    const audio = new globalThis.Audio(definition.src);
    audio.preload = 'auto';
    audio.loop = definition.loop;
    audio.volume = 0;
    audio.playsInline = true;
    const track = { key, audio, volume: definition.volume, fadeToken: 0 };
    audio.addEventListener?.('ended', () => {
      if (this.currentKey === key && !audio.loop) this.currentKey = null;
    });
    return track;
  }

  unlock() {
    this.unlocked = true;
    if (!this.muted && !this.pausedByGame && this.desiredKey) this.startDesired(false);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.pauseAll();
      return;
    }
    if (this.unlocked && !this.pausedByGame) this.startDesired(false);
  }

  scene(key, { fadeOut = .32, fadeIn = .42, restart = true } = {}) {
    if (!MUSIC_SCENES[key]) return false;
    this.desiredKey = key;
    if (!this.unlocked || this.muted || this.pausedByGame) return false;
    const next = this.tracks[key];
    if (!next) return false;

    if (this.currentKey === key) {
      if (restart) {
        try { next.audio.currentTime = 0; } catch { /* media not seekable yet */ }
      }
      this.safePlay(next.audio);
      this.fade(next, next.volume, fadeIn);
      return true;
    }

    const previous = this.tracks[this.currentKey];
    if (previous) this.fade(previous, 0, fadeOut, true);

    this.currentKey = key;
    next.fadeToken += 1;
    try { if (restart) next.audio.currentTime = 0; } catch { /* media not seekable yet */ }
    next.audio.volume = 0;
    this.safePlay(next.audio);
    this.fade(next, next.volume, fadeIn);
    return true;
  }

  startDesired(restart = false) {
    if (!this.desiredKey) return false;
    return this.scene(this.desiredKey, { fadeOut: 0, fadeIn: .32, restart });
  }

  stop({ duration = .35, clearDesired = true } = {}) {
    if (clearDesired) this.desiredKey = null;
    const current = this.tracks[this.currentKey];
    this.currentKey = null;
    if (current) this.fade(current, 0, duration, true);
    for (const track of Object.values(this.tracks)) {
      if (track && track !== current && !track.audio.paused) this.fade(track, 0, duration, true);
    }
  }

  pause() {
    this.pausedByGame = true;
    this.pauseAll();
  }

  resume() {
    this.pausedByGame = false;
    if (!this.muted && this.unlocked) this.startDesired(false);
  }

  pauseAll() {
    for (const track of Object.values(this.tracks)) {
      if (!track) continue;
      track.fadeToken += 1;
      track.audio.pause();
    }
  }

  safePlay(audio) {
    const result = audio.play();
    result?.catch?.(() => {});
  }

  fade(track, target, duration, stopAtEnd = false) {
    if (!track) return;
    const token = ++track.fadeToken;
    const audio = track.audio;
    const startVolume = Number.isFinite(audio.volume) ? audio.volume : 0;
    const started = now();
    const milliseconds = Math.max(0, duration * 1000);

    if (milliseconds === 0) {
      audio.volume = target;
      if (stopAtEnd && target <= 0) {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* ignore */ }
      }
      return;
    }

    const step = () => {
      if (track.fadeToken !== token) return;
      const progress = Math.min(1, (now() - started) / milliseconds);
      audio.volume = startVolume + (target - startVolume) * progress;
      if (progress < 1) {
        setTimeout(step, 24);
        return;
      }
      if (stopAtEnd && target <= 0) {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* ignore */ }
      }
    };
    step();
  }
}
