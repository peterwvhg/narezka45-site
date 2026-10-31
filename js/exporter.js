(function () {
  "use strict";

  function num(v) {
    const s = Number(v).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return s === "-0" ? "0" : s;
  }

  /* Подгонка под TikTok: вертикаль 9:16, 1080x1920, H.264 + AAC, MP4.
     Если исходник уже 9:16 — разрешение не трогаем (апскейл качества не добавляет). */
  function even(n) { n = Math.round(n); return Math.max(2, n % 2 === 0 ? n : n - 1); }

  function tiktokPlan(srcW, srcH, mode) {
    if (!mode || mode === "off") return null;
    const sw = srcW || 0, sh = srcH || 0;
    const ar = sw && sh ? sw / sh : 0;
    const native = ar && Math.abs(ar - 9 / 16) < 0.015;
    const W = native ? even(sw) : 1080;
    const H = native ? even(sh) : 1920;
    return {
      W: W, H: H, native: native,
      build: function (inLabel, outLabel, id) {
        const i = inLabel, o = outLabel, u = id || "t";
        if (native) return "[" + i + "]scale=" + W + ":" + H + ":flags=lanczos,setsar=1[" + o + "]";
        if (mode === "fill") {
          // Сначала режем исходный кадр до пропорции 9:16, потом масштабируем: так в разы быстрее.
          return "[" + i + "]crop=w='trunc(min(iw,ih*" + W + "/" + H + ")/2)*2':h='trunc(min(ih,iw*" + H + "/" + W + ")/2)*2'," +
            "scale=" + W + ":" + H + ":flags=lanczos,setsar=1[" + o + "]";
        }
        if (mode === "blur") {
          return "[" + i + "]split[" + u + "a][" + u + "b];" +
            "[" + u + "a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:2,scale=" + W + ":" + H + ",setsar=1[" + u + "bg];" +
            "[" + u + "b]scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease:flags=lanczos[" + u + "fg];" +
            "[" + u + "bg][" + u + "fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[" + o + "]";
        }
        return "[" + i + "]scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease:flags=lanczos," +
          "pad=" + W + ":" + H + ":(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[" + o + "]";
      }
    };
  }

  function Exporter(opts) {
    opts = opts || {};
    this.onStatus = opts.onStatus || function () {};
    this.onProgress = opts.onProgress || function () {};
    this.ffmpeg = null;
    this._loading = null;
    this.logs = [];
    this.mounted = null;
    this._probeCache = new Map();
  }

  Exporter.prototype._fetchBlobUrl = async function (url, mime, onProgress) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("Не удалось загрузить движок (" + res.status + ")");
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body || !res.body.getReader) {
      const blob = await res.blob();
      return URL.createObjectURL(new Blob([blob], { type: mime }));
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.length;
      if (total && onProgress) onProgress(Math.min(1, received / total));
    }
    const blob = new Blob(chunks, { type: mime });
    return URL.createObjectURL(blob);
  };

  Exporter.prototype.ensure = function () {
    const self = this;
    if (this.ffmpeg && this.ffmpeg.loaded) return Promise.resolve(this.ffmpeg);
    if (this._loading) return this._loading;
    this._loading = (async function () {
      self.onStatus("Загружаю видео-движок", 0, "первый запуск, ~31 МБ");
      if (!window.FFmpegWASM) {
        await U.loadScript("vendor/ffmpeg/ffmpeg.js");
      }
      if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
        throw new Error("Видео-движок не загрузился");
      }
      const ff = new window.FFmpegWASM.FFmpeg();
      ff.on("log", function (e) {
        if (!e || !e.message) return;
        self.logs.push(e.message);
        if (self.logs.length > 600) self.logs.shift();
      });
      ff.on("progress", function (e) {
        if (!e || typeof e.progress !== "number") return;
        if (!isFinite(e.progress)) return;
        self.onProgress(U.clamp(e.progress, 0, 1));
      });
      const coreURL = await self._fetchBlobUrl("vendor/ffmpeg/ffmpeg-core.js", "text/javascript");
      const wasmURL = await self._fetchBlobUrl("vendor/ffmpeg/ffmpeg-core.wasm", "application/wasm", function (p) {
        self.onStatus("Загружаю видео-движок", p, Math.round(p * 100) + "%");
      });
      self.onStatus("Запускаю видео-движок", 0.9, "");
      await ff.load({ coreURL: coreURL, wasmURL: wasmURL });
      self.ffmpeg = ff;
      self.onStatus("Видео-движок готов", 1, "");
      return ff;
    })();
    const p = this._loading;
    p.catch(function () { self._loading = null; self.ffmpeg = null; });
    return p;
  };

  Exporter.prototype._writeFile = async function (name, file) {
    const ff = await this.ensure();
    if (ff._fsNames && ff._fsNames.has(name)) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    await ff.writeFile(name, buf);
    if (!ff._fsNames) ff._fsNames = new Set();
    ff._fsNames.add(name);
  };

  Exporter.prototype._deleteFile = async function (name) {
    if (!this.ffmpeg) return;
    try { await this.ffmpeg.deleteFile(name); } catch (e) { /* ignore */ }
    if (this.ffmpeg._fsNames) this.ffmpeg._fsNames.delete(name);
  };

  Exporter.prototype._sourceName = function (file) {
    const webm = /webm/i.test(file.type) || /\.webm$/i.test(file.name || "");
    return webm ? "source.webm" : "source.mp4";
  };

  Exporter.prototype.mount = async function (file, onStatus) {
    if (this.mounted && this.mounted.file === file) return this.mounted;
    if (this.mounted) {
      await this._deleteFile(this.mounted.name);
      this.mounted = null;
    }
    if (onStatus) onStatus("Готовлю видео", 0, "");
    const name = this._sourceName(file);
    await this._writeFile(name, file);
    this.mounted = { file: file, name: name, hasAudio: null };
    return this.mounted;
  };

  Exporter.prototype.reset = async function () {
    if (this.mounted) {
      await this._deleteFile(this.mounted.name);
      this.mounted = null;
    }
    this._probeCache.clear();
  };

  Exporter.prototype.probe = async function (file, name) {
    const key = (file.name || "") + ":" + file.size;
    if (this._probeCache.has(key)) return this._probeCache.get(key);
    const ff = await this.ensure();
    this.logs.length = 0;
    try { await ff.exec(["-hide_banner", "-i", name]); } catch (e) { /* ffmpeg exits with error without output */ }
    const text = this.logs.join("\n");
    const info = {
      hasAudio: /Stream #[^\n]*Audio:/.test(text),
      hasVideo: /Stream #[^\n]*Video:/.test(text)
    };
    this._probeCache.set(key, info);
    return info;
  };

  Exporter.prototype._lastError = function () {
    const tail = this.logs.slice(-14).join("\n");
    return tail || "неизвестная ошибка";
  };

  Exporter.prototype.cut = async function (opts) {
    const file = opts.file;
    const chunk = opts.chunk;
    const self = this;
    await this.ensure();
    const mounted = await this.mount(file, opts.onStatus);
    const srcInfo = await this.probe(file, mounted.name);

    this.logs.length = 0;
    const outName = "part_" + Date.now() + ".mp4";
    const plan = tiktokPlan(opts.width, opts.height, opts.tiktok);
    const args = ["-y", "-hide_banner", "-ss", num(chunk.start), "-i", mounted.name, "-t", num(chunk.dur)];
    if (plan) args.push("-filter_complex", plan.build("0:v:0", "outv", "c"), "-map", "[outv]");
    else args.push("-map", "0:v:0");
    if (srcInfo.hasAudio) args.push("-map", "0:a:0", "-c:a", "aac", "-b:a", plan ? "192k" : "128k", "-ar", "48000");
    else args.push("-an");
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", plan ? "18" : "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outName);

    try {
      await this.ffmpeg.exec(args);
      const data = await this.ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data], { type: "video/mp4" });
      await this._deleteFile(outName);
      return blob;
    } catch (e) {
      await this._deleteFile(outName);
      throw new Error("Не удалось нарезать часть. " + this._lastError().slice(0, 240));
    }
  };

  Exporter.prototype.bake = async function (opts) {
    const file = opts.file;
    const chunk = opts.chunk;
    const adFile = opts.adFile;
    const adDur = Math.max(0.5, opts.adDur || 0);
    const key = opts.key || {};
    const plan = tiktokPlan(opts.width, opts.height, opts.tiktok);
    let W = Math.max(2, Math.round(opts.width || 1280));
    let H = Math.max(2, Math.round(opts.height || 720));
    W = W % 2 === 0 ? W : W - 1;
    H = H % 2 === 0 ? H : H - 1;
    if (plan) { W = plan.W; H = plan.H; }

    await this.ensure();
    await this.mount(file);
    if (!this._adMounted || this._adMounted.file !== adFile) {
      if (this._adMounted) await this._deleteFile(this._adMounted.name);
      const adName = /webm/i.test(adFile.type) ? "ad.webm" : "ad.mp4";
      await this._writeFile(adName, adFile);
      this._adMounted = { file: adFile, name: adName };
    }

    const srcInfo = await this.probe(file, this.mounted.name);
    const adInfo = await this.probe(adFile, this._adMounted.name);

    const MID = Math.max(0.05, chunk.dur / 2);
    const END = chunk.dur;
    const REST = Math.max(0.05, END - MID);
    const sim = U.clamp(0.12 + (key.sim || 0.26) * 0.6, 0.05, 0.6);
    const blend = U.clamp((key.smooth || 0.08) * 1.2, 0.01, 0.3);

    const needsSilent = !srcInfo.hasAudio || !adInfo.hasAudio;
    const filter = [];
    // Сначала уменьшаем рекламу, потом убираем зелёный: colorkey считает на меньшем кадре (~2x быстрее).
    filter.push("[1:v]scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease,format=yuv420p" +
      ",colorkey=color=0x00FF00:similarity=" + num(sim) + ":blend=" + num(blend) +
      ",pad=" + W + ":" + H + ":(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba[keyed]");
    // Метка фильтра читается один раз, поэтому после подгонки под TikTok размножаем кадр через split.
    let vin1 = "0:v", vin2 = "0:v";
    if (plan) {
      filter.push(plan.build("0:v", "nv", "b"));
      filter.push("[nv]split[nva][nvb]");
      vin1 = "nva"; vin2 = "nvb";
    }
    filter.push("[" + vin1 + "]trim=0:" + num(MID) + ",setpts=PTS-STARTPTS[v1]");
    filter.push("[" + vin2 + "]trim=" + num(MID) + ":" + num(END) + ",setpts=PTS-STARTPTS,split[rest][fs]");
    filter.push("[fs]trim=0:0.04,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=" + num(adDur) + ",setpts=PTS-STARTPTS[freeze]");
    filter.push("[freeze][keyed]overlay=format=auto,format=yuv420p[adv]");

    let silentUses = 0;
    if (!adInfo.hasAudio) silentUses++;
    if (!srcInfo.hasAudio) silentUses += 2;

    const silent = [];
    if (silentUses > 0) {
      const names = ["s0", "s1", "s2"].slice(0, silentUses);
      if (silentUses === 1) {
        filter.push("[2:a]anull[s0]");
      } else {
        filter.push("[2:a]asplit=" + silentUses + names.map(function (n) { return "[" + n + "]"; }).join(""));
      }
      silent.push.apply(silent, names);
    }
    const astuff = ",asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";

    if (adInfo.hasAudio) {
      filter.push("[1:a]atrim=0:" + num(adDur) + astuff + ",apad,atrim=0:" + num(adDur) + "[aad]");
    } else {
      const lbl = silent.shift();
      filter.push("[" + lbl + "]atrim=0:" + num(adDur) + astuff + "[aad]");
    }

    if (srcInfo.hasAudio) {
      filter.push("[0:a]atrim=0:" + num(MID) + astuff + "[a1]");
      filter.push("[0:a]atrim=" + num(MID) + ":" + num(END) + astuff + "[a2]");
    } else {
      const l1 = silent.shift();
      const l2 = silent.shift();
      filter.push("[" + l1 + "]atrim=0:" + num(MID) + astuff + "[a1]");
      filter.push("[" + l2 + "]atrim=0:" + num(REST) + astuff + "[a2]");
    }

    filter.push("[v1][a1][adv][aad][rest][a2]concat=n=3:v=1:a=1[outv][outa]");

    const outName = "baked_" + Date.now() + ".mp4";
    const args = ["-y", "-hide_banner", "-ss", num(chunk.start), "-t", num(chunk.dur), "-i", this.mounted.name, "-i", this._adMounted.name];
    if (needsSilent) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    args.push("-filter_complex", filter.join(";"), "-map", "[outv]", "-map", "[outa]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", plan ? "18" : "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", plan ? "192k" : "128k", "-movflags", "+faststart", outName);

    this.logs.length = 0;
    try {
      await this.ffmpeg.exec(args);
      const data = await this.ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data], { type: "video/mp4" });
      await this._deleteFile(outName);
      return blob;
    } catch (e) {
      await this._deleteFile(outName);
      throw new Error("Не удалось вклеить рекламу. " + this._lastError().slice(0, 300));
    }
  };

  window.Exporter = Exporter;
})();
