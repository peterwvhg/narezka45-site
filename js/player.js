(function () {
  "use strict";

  function Player(opts) {
    this.video = opts.video;
    this.canvas = opts.canvas;
    this.badge = opts.badge;
    this.countdown = opts.countdown;
    this.bigPlay = opts.bigPlay;
    this.timeLabel = opts.timeLabel;
    this.onState = opts.onState || function () {};
    this.onProgress = opts.onProgress || function () {};
    this.onChunk = opts.onChunk || function () {};
    this.onAdBlocked = opts.onAdBlocked || function () {};

    this.chunks = [];
    this.current = 0;
    this.chunk = null;
    this.phase = "idle";
    this.adPlayed = false;
    this.adUrl = null;
    this.adDur = 0;
    this.muted = false;
    this._raf = 0;
    this._tick = this._tick.bind(this);
    this._adEnded = this._adEnded.bind(this);

    this.keyer = new ChromaKeyer(this.canvas);
    this.keyer.setParams({ sim: 0.26, smooth: 0.08 });

    const ad = document.createElement("video");
    ad.playsInline = true;
    ad.setAttribute("playsinline", "");
    ad.preload = "auto";
    ad.muted = false;
    ad.style.cssText = "position:fixed;left:-8px;bottom:-8px;width:2px;height:2px;opacity:.001;pointer-events:none;z-index:-1";
    document.body.appendChild(ad);
    this.ad = ad;
    this.keyer.setVideo(ad);
    ad.addEventListener("ended", this._adEnded);

    this.video.addEventListener("ended", () => {
      if (this.phase === "playing" || this.phase === "ad") this._finish();
    });
    this.video.addEventListener("error", () => {
      if (this.phase !== "idle") this.onState("error");
    });
    this.video.addEventListener("pause", () => {
      if (this.phase === "playing") {
        this.phase = "paused";
        this._stopLoop();
        this.onState("paused");
      }
    });
    this.video.addEventListener("play", () => {
      if (this.phase === "paused") {
        this.phase = "playing";
        this.onState("playing");
        this._startLoop();
      }
    });
  }

  Player.prototype.setChunks = function (chunks) {
    this.chunks = chunks || [];
    if (this.chunks.length) {
      this.current = 0;
      this.chunk = this.chunks[0];
    } else {
      this.current = 0;
      this.chunk = null;
    }
  };

  Player.prototype._applyAdHint = function () {
    this.onChunk(this.current, this.chunk);
  };

  Player.prototype.setAd = function (url, duration) {
    this.adUrl = url || null;
    this.adDur = url ? (duration || 0) : 0;
    if (url) {
      this.ad.src = url;
      this.ad.muted = this.muted;
      try { this.ad.load(); } catch (e) { /* ignore */ }
    } else {
      this.ad.removeAttribute("src");
      try { this.ad.load(); } catch (e) { /* ignore */ }
    }
    this._applyAdHint();
  };

  Player.prototype.unlockAd = function () {
    if (!this.adUrl) return;
    const ad = this.ad;
    const wasMuted = ad.muted;
    ad.muted = true;
    const p = ad.play();
    if (p && p.then) {
      p.then(() => {
        ad.pause();
        ad.currentTime = 0;
        ad.muted = this.muted;
      }).catch(() => { ad.muted = wasMuted; });
    }
  };

  Player.prototype.loadChunk = function (index, autoplay) {
    if (!this.chunks.length) return;
    const i = U.clamp(index, 0, this.chunks.length - 1);
    this._stopAd(false);
    this._stopLoop();
    this.current = i;
    this.chunk = this.chunks[i];
    this.adPlayed = false;
    this.phase = "paused";
    this.canvas.classList.remove("live");
    this.badge.hidden = true;
    this.bigPlay.classList.remove("hidden");
    const self = this;
    try { this.video.currentTime = this.chunk.start + 0.001; } catch (e) { /* ignore */ }
    if (this.video.readyState < 1) {
      this.video.addEventListener("loadedmetadata", function () {
        if (self.phase === "idle") return;
        try { self.video.currentTime = Math.min(self.chunk.start + 0.001, Math.max(0, self.video.duration - 0.05)); } catch (e) { /* ignore */ }
      }, { once: true });
    }
    this.onChunk(i, this.chunk);
    this.onProgress(0, 0, this.chunk.dur);
    if (autoplay) this.play();
    else this.onState("paused");
  };

  Player.prototype.play = function () {
    if (!this.chunk) return;
    if (this.phase === "ended") {
      this.loadChunk(this.current, true);
      return;
    }
    const p = this.video.play();
    if (p && p.catch) {
      p.then(() => {
        if (this.phase !== "ad") {
          this.phase = "playing";
          this.bigPlay.classList.add("hidden");
          this.onState("playing");
          this._startLoop();
        }
      }).catch(() => {
        this.onState("blocked");
      });
    } else {
      this.phase = "playing";
      this.bigPlay.classList.add("hidden");
      this.onState("playing");
      this._startLoop();
    }
  };

  Player.prototype.pause = function () {
    if (this.phase === "ad") return;
    this.video.pause();
    this.phase = "paused";
    this.bigPlay.classList.remove("hidden");
    this._stopLoop();
    this.onState("paused");
  };

  Player.prototype.toggle = function () {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused" || this.phase === "idle" || this.phase === "ended") this.play();
  };

  Player.prototype._startLoop = function () {
    if (this._raf) return;
    this._raf = requestAnimationFrame(this._tick);
  };

  Player.prototype._stopLoop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  Player.prototype._tick = function () {
    this._raf = 0;
    const c = this.chunk;
    if (!c) return;

    if (this.phase === "playing") {
      const rel = this.video.currentTime - c.start;
      if (rel >= c.dur - 0.05) { this._finish(); return; }
      if (this.adDur > 0 && !this.adPlayed && rel >= c.dur / 2) {
        this._startAd();
        return;
      }
      const frac = U.clamp(rel / c.dur, 0, 1);
      this.onProgress(frac, Math.max(0, rel), c.dur);
      this._raf = requestAnimationFrame(this._tick);
    } else if (this.phase === "ad") {
      this.keyer.renderFrame();
      const left = Math.max(0, this.adDur - this.ad.currentTime);
      this.countdown.textContent = U.fmtTime(left);
      this._raf = requestAnimationFrame(this._tick);
    }
  };

  Player.prototype._startAd = function () {
    if (!this.adUrl || !this.adDur) return;
    this.adPlayed = true;
    this.phase = "ad";
    this.video.pause();
    this._stopLoop();
    const ad = this.ad;
    try { ad.currentTime = 0; } catch (e) { /* ignore */ }
    ad.muted = this.muted;
    const p = ad.play();
    if (p && p.catch) {
      p.catch(() => {
        ad.muted = true;
        ad.play().catch(() => {
          this.onAdBlocked();
          this._stopAd(true);
        });
      });
    }
    this.canvas.classList.add("live");
    this.badge.hidden = false;
    this.bigPlay.classList.add("hidden");
    this.countdown.textContent = U.fmtTime(this.adDur);
    this.keyer.renderFrame();
    this.onState("ad");
    this._startLoop();
  };

  Player.prototype._adEnded = function () {
    if (this.phase !== "ad") return;
    this._stopAd(true);
    const p = this.video.play();
    if (p && p.catch) p.catch(() => { this._finish(); });
  };

  Player.prototype._stopAd = function (resume) {
    if (this.phase === "ad") {
      try { this.ad.pause(); } catch (e) { /* ignore */ }
      this.keyer.stop();
      this.canvas.classList.remove("live");
      this.badge.hidden = true;
      if (resume) {
        this.phase = "playing";
        this.onState("playing");
        this._startLoop();
      } else {
        this.phase = this.video.paused ? "paused" : "playing";
        this.onState(this.phase);
        if (this.phase === "playing") this._startLoop();
        else this.bigPlay.classList.remove("hidden");
      }
    }
  };

  Player.prototype._finish = function () {
    this._stopAd(false);
    this._stopLoop();
    this.phase = "ended";
    try { this.video.pause(); } catch (e) { /* ignore */ }
    this.bigPlay.classList.remove("hidden");
    const c = this.chunk;
    if (c) this.onProgress(1, c.dur, c.dur);
    this.onState("ended");
  };

  Player.prototype.setMuted = function (muted) {
    this.muted = muted;
    this.video.muted = muted;
    this.ad.muted = muted;
    return muted;
  };

  Player.prototype.dispose = function () {
    this._stopLoop();
    this._stopAd(false);
    this.chunks = [];
    this.chunk = null;
    this.phase = "idle";
    this.adUrl = null;
    this.adDur = 0;
    this.ad.removeAttribute("src");
    try { this.ad.load(); } catch (e) { /* ignore */ }
    this.video.removeAttribute("src");
    try { this.video.load(); } catch (e) { /* ignore */ }
  };

  window.Player = Player;
})();
