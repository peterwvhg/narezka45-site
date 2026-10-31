(function () {
  "use strict";

  const Media = {};
  const PART = 45;

  Media.PART_SIZE = PART;

  Media.buildChunks = function (duration, partSize) {
    const size = partSize || PART;
    const chunks = [];
    if (!isFinite(duration) || duration <= 0) return chunks;
    let start = 0;
    let i = 0;
    while (start < duration - 0.04) {
      const end = Math.min(start + size, duration);
      chunks.push({
        index: i,
        start: start,
        end: end,
        dur: end - start,
        mid: start + (end - start) / 2,
        midRel: (end - start) / 2
      });
      start = end;
      i++;
    }
    return chunks;
  };

  Media.loadFile = function (file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;
      v.style.cssText = "position:fixed;left:-4px;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none";
      document.body.appendChild(v);

      let settled = false;
      const finish = function () {
        if (settled) return;
        settled = true;
        v.remove();
        resolve({ url: url, duration: v.duration, width: v.videoWidth, height: v.videoHeight, file: file });
      };
      const fail = function () {
        if (settled) return;
        settled = true;
        v.remove();
        URL.revokeObjectURL(url);
        reject(new Error("Браузер не смог прочитать это видео. Попробуйте MP4 (H.264)."));
      };

      v.addEventListener("loadedmetadata", function () {
        if (isFinite(v.duration) && v.duration > 0) { finish(); return; }
        v.addEventListener("durationchange", function () {
          if (isFinite(v.duration) && v.duration > 0) finish();
        }, { once: true });
        v.currentTime = 1e6;
        setTimeout(function () { if (!settled) finish(); }, 2500);
      }, { once: true });
      v.addEventListener("error", fail, { once: true });
      setTimeout(function () { if (!settled) fail(); }, 20000);
      v.src = url;
    });
  };

  function frameStats(data, w, h) {
    const lums = new Float32Array(w * h);
    let sumL = 0, sumL2 = 0;
    let hueX = 0, hueY = 0, satSum = 0, satWeight = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255;
        lums[y * w + x] = l;
        sumL += l;
        sumL2 += l * l;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        const sat = max > 0 ? d / max : 0;
        satSum += sat;
        satWeight += sat;
        if (sat > 0.16 && d > 0.0001) {
          let hue;
          if (max === r) hue = ((g - b) / d) % 6;
          else if (max === g) hue = (b - r) / d + 2;
          else hue = (r - g) / d + 4;
          hue *= 60;
          if (hue < 0) hue += 360;
          const rad = (hue * Math.PI) / 180;
          hueX += Math.cos(rad) * sat;
          hueY += Math.sin(rad) * sat;
        }
      }
    }
    const n = w * h;
    const avgL = sumL / n;
    const std = Math.sqrt(Math.max(0, sumL2 / n - avgL * avgL));

    let edge = 0, ec = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        edge += Math.abs(lums[i] - lums[i + 1]) + Math.abs(lums[i] - lums[i + w]);
        ec += 2;
      }
    }
    edge = ec ? edge / ec : 0;

    let hue = null;
    if (satWeight > n * 0.04 && Math.hypot(hueX, hueY) > 0.0001) {
      hue = ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360;
    }
    return { l: avgL, std: std, sat: satSum / n, hue: hue, edge: edge, lums: lums };
  }

  function diffFrames(a, b) {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
    return n ? s / n : 0;
  }

  function paletteName(hue, sat) {
    if (hue === null || sat < 0.16) return "нейтральная палитра";
    if (hue < 20 || hue >= 340) return "тёплые красные тона";
    if (hue < 45) return "тёплые оранжевые тона";
    if (hue < 70) return "жёлтые тёплые тона";
    if (hue < 160) return "зелёные тона";
    if (hue < 200) return "бирюзовые тона";
    if (hue < 255) return "холодные синие тона";
    if (hue < 290) return "фиолетовые тона";
    return "пурпурные тона";
  }

  function lightName(l) {
    if (l < 52) return "Тёмная сцена";
    if (l < 105) return "Приглушённый свет";
    if (l < 175) return "Ровное освещение";
    return "Светлая сцена";
  }

  function motionName(m) {
    if (m < 2.5) return "статичный кадр";
    if (m < 8) return "спокойное движение";
    if (m < 18) return "активное движение";
    return "быстрая смена планов";
  }

  function contrastName(std) {
    if (std < 18) return "мягкий контраст";
    if (std < 42) return "средний контраст";
    return "высокий контраст";
  }

  function sharpName(edge) {
    if (edge < 5) return "мягкая картинка";
    if (edge < 13) return "нормальная детализация";
    return "чёткая детализация";
  }

  function paletteTag(hue, sat) {
    if (hue === null || sat < 0.16) return "нейтрально";
    if (hue < 20 || hue >= 340) return "красный";
    if (hue < 45) return "оранжевый";
    if (hue < 70) return "жёлтый";
    if (hue < 160) return "зелёный";
    if (hue < 200) return "бирюза";
    if (hue < 255) return "синий";
    if (hue < 290) return "фиолетовый";
    return "пурпурный";
  }

  function lightTag(l) {
    if (l < 52) return "тёмно";
    if (l < 105) return "приглушённо";
    if (l < 175) return "ровный свет";
    return "светло";
  }

  function motionTag(m) {
    if (m < 2.5) return "статично";
    if (m < 8) return "спокойно";
    if (m < 18) return "динамика";
    return "быстрые планы";
  }

  Media.describe = function (stats, chunk, totalChunks) {
    const light = lightName(stats.l);
    const palette = paletteName(stats.hue, stats.sat);
    const motion = motionName(stats.motion);
    const contrast = contrastName(stats.contrast);
    const sharp = sharpName(stats.edge);
    const cuts = stats.cuts;

    let s2;
    if (cuts > 0) {
      s2 = motion.charAt(0).toUpperCase() + motion.slice(1) + ", смен плана: " + cuts;
      if (stats.cutsAt && stats.cutsAt.length) {
        const list = stats.cutsAt.slice(0, 4).map(function (t) { return U.fmtTime(t); }).join(", ");
        s2 += " (на " + list + ")";
      }
      s2 += ".";
    } else {
      s2 = motion.charAt(0).toUpperCase() + motion.slice(1) + ", без склеек.";
    }
    const text = light + ", " + palette + ". " + s2 + " " + contrast.charAt(0).toUpperCase() + contrast.slice(1) + ", " + sharp + ".";
    const tags = [lightTag(stats.l), paletteTag(stats.hue, stats.sat), motionTag(stats.motion)];
    if (cuts > 0) tags.push(cuts + (cuts === 1 ? " склейка" : cuts < 5 ? " склейки" : " склеек"));
    if (totalChunks > 1 && chunk.index === totalChunks - 1) tags.push("финал");
    return { text: text, tags: tags };
  };

  Media.analyze = async function (opts) {
    const url = opts.url;
    const chunks = opts.chunks;
    const onProgress = opts.onProgress || function () {};
    const onChunk = opts.onChunk || function () {};
    const width = opts.sampleWidth || 96;

    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.style.cssText = "position:fixed;left:-4px;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(v);
    v.src = url;
    try {
      await U.waitEvent(v, "loadedmetadata", 20000);
    } catch (e) {
      v.remove();
      throw e;
    }

    const srcW = v.videoWidth || 16;
    const srcH = v.videoHeight || 9;
    const sh = Math.max(2, Math.round((width * srcH) / srcW));
    const statsCanvas = document.createElement("canvas");
    statsCanvas.width = width;
    statsCanvas.height = sh;
    const sctx = statsCanvas.getContext("2d", { willReadFrequently: true });

    const thumbW = Math.min(480, srcW || 480);
    const thumbH = Math.max(2, Math.round((thumbW * srcH) / srcW));
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const tctx = thumbCanvas.getContext("2d");

    const SAMPLES = 7;
    const totalSteps = chunks.length * SAMPLES;
    let done = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const frames = [];
      const times = [];
      for (let s = 0; s < SAMPLES; s++) {
        const frac = (s + 0.5) / SAMPLES;
        const t = U.clamp(chunk.start + chunk.dur * frac, 0.02, Math.max(0.02, chunk.end - 0.05));
        await U.seekTo(v, t);
        let st = null;
        try {
          sctx.drawImage(v, 0, 0, width, sh);
          const img = sctx.getImageData(0, 0, width, sh);
          st = frameStats(img.data, width, sh);
        } catch (e) { /* tainted or no frame */ }
        if (st) { frames.push(st); times.push(t - chunk.start); }

        if (s === 2) {
          try {
            tctx.drawImage(v, 0, 0, thumbW, thumbH);
            chunk.thumb = thumbCanvas.toDataURL("image/jpeg", 0.72);
          } catch (e) { chunk.thumb = null; }
        }
        done++;
        onProgress(done, totalSteps, ci);
        await U.sleep(0);
      }

      let l = 0, sat = 0, contrast = 0, edge = 0, motion = 0;
      let hueX = 0, hueY = 0;
      const cutsAt = [];
      if (frames.length) {
        for (let i = 0; i < frames.length; i++) {
          l += frames[i].l;
          sat += frames[i].sat;
          contrast += frames[i].std;
          edge += frames[i].edge;
          if (frames[i].hue !== null) {
            const rad = (frames[i].hue * Math.PI) / 180;
            hueX += Math.cos(rad) * frames[i].sat;
            hueY += Math.sin(rad) * frames[i].sat;
          }
          if (i > 0) {
            const d = diffFrames(frames[i - 1].lums, frames[i].lums);
            motion += d;
            if (d > 30) cutsAt.push(times[i]);
          }
        }
        const n = frames.length;
        l /= n; sat /= n; contrast /= n; edge /= n;
        motion = n > 1 ? motion / (n - 1) : 0;
        let hue = null;
        if (Math.hypot(hueX, hueY) > 0.0001) {
          hue = ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360;
        }
        chunk.stats = {
          l: l, sat: sat, contrast: contrast, edge: edge,
          hue: hue, motion: motion, cuts: cutsAt.length, cutsAt: cutsAt
        };
        const described = Media.describe(chunk.stats, chunk, chunks.length);
        chunk.text = described.text;
        chunk.tags = described.tags;
      } else {
        chunk.stats = null;
        chunk.text = "Автоанализ не смог прочитать кадры этого фрагмента.";
        chunk.tags = [];
      }
      onChunk(chunk);
    }

    v.remove();
  };

  window.Media = Media;
})();
