const now = () => globalThis.performance?.now?.() ?? Date.now();

export const MUSIC_SCENES = Object.freeze({
  menu: { src: './assets/audio/menu.mp3', loop: true, volume: .46 },
  stage: { src: './assets/audio/stage.mp3', loop: true, volume: .52 },
  warning: { src: './assets/audio/boss-warning.mp3', loop: false, volume: .82 },
  boss: { src: './assets/audio/boss.mp3', loop: true, volume: .58 },
});

// One persistent HTMLAudio element is used for every music scene. Mobile Safari
// can suspend or replace playback when several media elements are primed during
// the same gesture; keeping one unlocked player makes later scene changes stable.
export class MusicController {
  constructor({ muted = false } = {}) {
    this.muted = Boolean(muted);
    this.unlocked = false;
    this.pausedByGame = false;
    this.currentKey = null;
    this.desiredKey = null;
    this.fadeToken = 0;
    this.audio = this.createPlayer();
  }

  createPlayer() {
    if (typeof globalThis.Audio !== 'function') return null;
    const audio = new globalThis.Audio();
    audio.preload = 'auto';
    audio.volume = 0;
    audio.playsInline = true;
    audio.setAttribute?.('playsinline', '');
    audio.setAttribute?.('webkit-playsinline', '');
    audio.addEventListener?.('ended', () => {
      const scene = MUSIC_SCENES[this.currentKey];
      if (scene && !scene.loop) this.currentKey = null;
    });
    return audio;
  }

  prepare(key) {
    if (!MUSIC_SCENES[key]) return false;
    this.desiredKey = key;
    return true;
  }

  unlock() {
    this.unlocked = true;
    if (this.muted || this.pausedByGame || !this.desiredKey) return false;
    return this.startDesired(false);
  }

  // Kept as a compatibility no-op. A single player no longer needs competing
  // hidden media elements to be primed.
  primeInactiveTracks() { return true; }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.pauseAll();
      return;
    }
    if (this.unlocked && !this.pausedByGame) this.startDesired(false);
  }

  scene(key, { fadeOut = .32, fadeIn = .42, restart = true } = {}) {
    if (!this.prepare(key)) return false;
    if (!this.unlocked || this.muted || this.pausedByGame || !this.audio) return false;
    const definition = MUSIC_SCENES[key];

    if (this.currentKey === key && this.audio.src) {
      if (restart) {
        try { this.audio.currentTime = 0; } catch { /* media not seekable yet */ }
      }
      this.safePlay();
      this.fade(definition.volume, fadeIn);
      return true;
    }

    const switchTrack = () => {
      if (!this.audio) return;
      this.fadeToken += 1;
      this.currentKey = key;
      this.audio.pause();
      this.audio.src = definition.src;
      this.audio.loop = definition.loop;
      this.audio.preload = 'auto';
      this.audio.volume = 0;
      try { if (restart) this.audio.currentTime = 0; } catch { /* ignore */ }
      this.audio.load?.();
      this.safePlay();
      this.fade(definition.volume, fadeIn);
    };

    if (this.currentKey && fadeOut > 0 && !this.audio.paused && this.audio.volume > 0) {
      this.fade(0, fadeOut, true, switchTrack);
    } else switchTrack();
    return true;
  }

  startDesired(restart = false) {
    if (!this.desiredKey) return false;
    return this.scene(this.desiredKey, { fadeOut: 0, fadeIn: .32, restart });
  }

  stop({ duration = .35, clearDesired = true } = {}) {
    if (clearDesired) this.desiredKey = null;
    this.currentKey = null;
    if (this.audio) this.fade(0, duration, true);
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
    this.fadeToken += 1;
    this.audio?.pause();
  }

  safePlay() {
    if (!this.audio) return false;
    let result;
    try { result = this.audio.play(); }
    catch {
      this.unlocked = false;
      return false;
    }
    Promise.resolve(result).catch(() => {
      // Keep the desired scene queued and retry on the next real user gesture.
      this.unlocked = false;
    });
    return true;
  }

  fade(target, duration, stopAtEnd = false, onComplete = null) {
    if (!this.audio) return;
    const token = ++this.fadeToken;
    const startVolume = Number.isFinite(this.audio.volume) ? this.audio.volume : 0;
    const started = now();
    const milliseconds = Math.max(0, duration * 1000);

    const finish = () => {
      if (stopAtEnd && target <= 0) this.audio.pause();
      onComplete?.();
    };

    if (milliseconds === 0) {
      this.audio.volume = target;
      finish();
      return;
    }

    const step = () => {
      if (this.fadeToken !== token) return;
      const progress = Math.min(1, (now() - started) / milliseconds);
      this.audio.volume = startVolume + (target - startVolume) * progress;
      if (progress < 1) {
        setTimeout(step, 24);
        return;
      }
      finish();
    };
    step();
  }
}
