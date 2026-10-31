(function () {
  "use strict";

  const $ = U.$;
  const $$ = U.$$;

  const state = {
    file: null,
    url: null,
    duration: 0,
    width: 0,
    height: 0,
    chunks: [],
    active: 0,
    ad: null,
    key: { sim: 0.26, smooth: 0.08 },
    analysisToken: 0,
    exporting: false
  };

  const els = {
    dropzone: $("#dropzone"),
    workspace: $("#workspace"),
    videoInput: $("#videoInput"),
    adInput: $("#adInput"),
    player: $("#player"),
    video: $("#video"),
    adCanvas: $("#adCanvas"),
    adBadge: $("#adBadge"),
    adCountdown: $("#adCountdown"),
    bigPlay: $("#bigPlay"),
    timeLabel: $("#timeLabel"),
    playIcon: $("#playIconPath"),
    statusPill: $("#statusPill"),
    videoName: $("#videoName"),
    videoSub: $("#videoSub"),
    chunks: $("#chunks"),
    chunksSummary: $("#chunksSummary"),
    timeline: $("#timeline"),
    playerChunkLabel: $("#playerChunkLabel"),
    playerAdHint: $("#playerAdHint"),
    adCard: $("#adCard"),
    adBody: $("#adBody"),
    adUploadBtn: $("#adUploadBtn"),
    adName: $("#adName"),
    adInfo: $("#adInfo"),
    adPreview: $("#adPreview"),
    adPreviewEmpty: $("#adPreviewEmpty"),
    keySimilarity: $("#keySimilarity"),
    keySimilarityOut: $("#keySimilarityOut"),
    keySmooth: $("#keySmooth"),
    keySmoothOut: $("#keySmoothOut"),
    jobbar: $("#jobbar"),
    jobTitle: $("#jobTitle"),
    jobDetail: $("#jobDetail"),
    jobFill: $("#jobFill"),
    jobCancel: $("#jobCancel"),
    playToggle: $("#playToggle"),
    rail: $("#rail"),
    railClose: $("#railClose"),
    chatToggle: $("#chatToggle"),
    scrim: $("#scrim"),
    chatLog: $("#chatLog"),
    chatChips: $("#chatChips"),
    chatForm: $("#chatForm"),
    chatInput: $("#chatInput")
  };

  /* ---------------- player ---------------- */
  const player = new Player({
    video: els.video,
    canvas: els.adCanvas,
    badge: els.adBadge,
    countdown: els.adCountdown,
    bigPlay: els.bigPlay,
    timeLabel: els.timeLabel,
    onState: onPlayerState,
    onProgress: onPlayerProgress,
    onChunk: onChunkShown,
    onAdBlocked: function () {
      U.toast("Звук рекламы заблокирован — нажмите ▶", "error");
    }
  });

  const PLAY_ICON = "M8 5.5v13l11-6.5z";
  const PAUSE_ICON = "M7 5h3.6v14H7zM13.4 5H17v14h-3.6z";

  function onPlayerState(phase) {
    const playing = phase === "playing" || phase === "ad";
    els.playIcon.setAttribute("d", playing ? PAUSE_ICON : PLAY_ICON);
    els.bigPlay.classList.toggle("hidden", playing);
    if (phase === "blocked") U.toast("Нажмите ▶, чтобы включить видео", "error");
  }

  function onPlayerProgress(frac, rel, dur) {
    els.timeLabel.textContent = U.fmtTime(rel) + " / " + U.fmtTime(dur);
    const fill = els.timeline.querySelector(".seg.active .seg-fill");
    if (fill) fill.style.width = (frac * 100).toFixed(2) + "%";
  }

  function onChunkShown(index, chunk) {
    if (!state.chunks.length || !chunk || typeof chunk.dur !== "number") {
      els.playerChunkLabel.textContent = "Видео не загружено";
      els.playerAdHint.hidden = true;
      return;
    }
    state.active = index;
    els.playerChunkLabel.textContent = "Часть " + (index + 1) + " из " + state.chunks.length;
    if (state.ad) {
      els.playerAdHint.hidden = false;
      els.playerAdHint.textContent = "реклама в " + U.fmtTime(chunk.midRel);
    } else {
      els.playerAdHint.hidden = true;
    }
    els.timeline.querySelectorAll(".seg").forEach(function (s, i) {
      s.classList.toggle("active", i === index);
    });
    $$(".chunk").forEach(function (c) {
      c.classList.toggle("active", Number(c.dataset.index) === index);
    });
    els.timeLabel.textContent = "00:00 / " + U.fmtTime(chunk.dur);
  }

  function playChunk(index) {
    if (!state.chunks.length) return;
    player.unlockAd();
    player.loadChunk(index, true);
    const card = els.chunks.querySelector('[data-index="' + index + '"]');
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  /* ---------------- status / job ---------------- */
  function setStatus(text, live) {
    els.statusPill.textContent = text;
    els.statusPill.classList.toggle("live", !!live);
  }

  function showJob(title) {
    els.jobbar.hidden = false;
    els.jobTitle.textContent = title;
    els.jobDetail.textContent = "";
    els.jobFill.style.width = "0%";
  }

  function jobProgress(p, detail) {
    if (!els.jobbar.hidden) {
      els.jobFill.style.width = (U.clamp(p || 0, 0, 1) * 100).toFixed(1) + "%";
      if (detail) els.jobDetail.textContent = detail;
    }
  }

  function hideJob() {
    els.jobbar.hidden = true;
  }

  const exporter = new Exporter({
    onStatus: function (title, p, detail) {
      if (!els.jobbar.hidden) jobProgress(p, detail);
    },
    onProgress: function (p) {
      jobProgress(p, Math.round(p * 100) + "%");
    }
  });

  /* ---------------- chat ---------------- */
  const assistant = new Assistant({
    log: els.chatLog,
    form: els.chatForm,
    input: els.chatInput,
    chips: els.chatChips,
    state: function () {
      return {
        chunks: state.chunks,
        active: state.active,
        duration: state.duration,
        ad: state.ad ? { name: state.ad.file.name, duration: state.ad.duration } : null,
        play: playChunk,
        copyChunk: copyChunk,
        copyAll: copyAll,
        downloadChunk: downloadChunk,
        downloadAll: downloadAll
      };
    },
    actions: {
      pickVideo: function () { els.videoInput.click(); },
      pickAd: function () { els.adInput.click(); },
      openAdPanel: openAdPanel
    }
  });

  assistant.notify("Привет! Загрузите видео — разложу его на части по 45 секунд, покажу превью и описание каждой, а рекламу поставлю ровно в середину.");

  function openAdPanel() {
    els.adCard.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!state.ad) setTimeout(function () { els.adInput.click(); }, 280);
  }

  /* ---------------- video load ---------------- */
  function pickVideo() { els.videoInput.click(); }

  els.videoInput.addEventListener("change", function () {
    const file = els.videoInput.files && els.videoInput.files[0];
    els.videoInput.value = "";
    if (file) loadVideo(file);
  });

  els.dropzone.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    pickVideo();
  });
  $("#pickVideoBtn").addEventListener("click", function (e) { e.stopPropagation(); pickVideo(); });
  $("#replaceVideoBtn").addEventListener("click", pickVideo);

  ["dragenter", "dragover"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropzone.classList.add("drag");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropzone.classList.remove("drag");
    });
  });
  els.dropzone.addEventListener("drop", function (e) {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadVideo(file);
  });

  function isVideo(file) {
    return file && (/^video\//.test(file.type) || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name || ""));
  }

  async function loadVideo(file) {
    if (!isVideo(file)) {
      U.toast("Нужен видеофайл (MP4, MOV или WebM)", "error");
      return;
    }
    if (state.exporting) {
      U.toast("Сначала дождитесь окончания обработки");
      return;
    }
    state.analysisToken++;

    player.dispose();
    exporter.reset();
    if (state.url) URL.revokeObjectURL(state.url);
    state.file = null;
    state.url = null;
    state.chunks = [];
    state.active = 0;

    setStatus("Читаю видео…");
    let meta;
    try {
      meta = await Media.loadFile(file);
    } catch (err) {
      setStatus("Формат не поддерживается");
      U.toast(err.message || "Не удалось прочитать видео", "error");
      assistant.notify("Не получилось открыть этот файл. Браузер не умеет читать такой кодек. Пересохраните видео в MP4 (H.264) и попробуйте снова.");
      return;
    }

    state.file = file;
    state.url = meta.url;
    state.duration = meta.duration;
    state.width = meta.width;
    state.height = meta.height;
    state.chunks = Media.buildChunks(meta.duration);

    els.workspace.hidden = false;
    els.dropzone.hidden = true;
    els.videoName.textContent = file.name;
    els.videoSub.textContent = U.fmtTime(meta.duration) + " · " + meta.width + "×" + meta.height + " · " + U.fmtBytes(file.size) + " · " + U.parts(state.chunks.length);
    els.chunksSummary.textContent = U.parts(state.chunks.length) + " · по 45 секунд";

    renderTimeline();
    renderChunks();
    setStatus(U.parts(state.chunks.length) + " · " + U.fmtTime(meta.duration), true);

    player.setChunks(state.chunks);
    player.setAd(state.ad ? state.ad.url : null, state.ad ? state.ad.duration : 0);
    els.video.src = meta.url;
    player.loadChunk(0, false);

    assistant.chips(["Список частей", "Описание 2 части", "Включи 1", "Скачать все"]);
    assistant.notify("«" + file.name + "» — " + U.fmtTime(meta.duration) + ", получилось " + U.parts(state.chunks.length) + ". Делаю превью и описываю кадры…");

    if (file.size > 500 * 1024 * 1024) {
      U.toast("Файл больше 500 МБ — на телефоне может не хватить памяти", "error");
    }

    analyzeChunks();
  }

  async function analyzeChunks() {
    const token = state.analysisToken;
    let last = -1;
    try {
      await Media.analyze({
        url: state.url,
        chunks: state.chunks,
        onChunk: function (c) {
          if (token !== state.analysisToken) return;
          updateChunkCard(c.index);
        },
        onProgress: function (done, total) {
          if (token !== state.analysisToken) return;
          const pct = Math.round((done / total) * 100);
          if (pct !== last) {
            last = pct;
            setStatus("Анализ кадров " + pct + "%");
          }
        }
      });
      if (token !== state.analysisToken) return;
      state.chunks.forEach(function (c) { updateChunkCard(c.index); });
      setStatus(U.parts(state.chunks.length) + " · " + U.fmtTime(state.duration), true);
      assistant.notify("Готово: превью и описания всех частей на месте. Могу рассказать про любую — например, «описание 2 части».");
    } catch (e) {
      if (token !== state.analysisToken) return;
      setStatus(U.parts(state.chunks.length) + " · " + U.fmtTime(state.duration), true);
      U.toast("Не удалось проанализировать кадры", "error");
    }
  }

  /* ---------------- chunks UI ---------------- */
  function renderChunks() {
    els.chunks.innerHTML = "";
    state.chunks.forEach(function (c) {
      const card = document.createElement("article");
      card.className = "chunk" + (c.index === state.active ? " active" : "");
      card.dataset.index = c.index;
      card.innerHTML =
        '<button class="chunk-thumb" data-act="play" type="button" aria-label="Смотреть часть ' + (c.index + 1) + '">' +
          '<div class="ph">готовлю превью…</div>' +
          '<span class="chunk-badge">ЧАСТЬ ' + U.pad2(c.index + 1) + '</span>' +
          '<span class="chunk-play" aria-hidden="true">▶</span>' +
          '<span class="chunk-time">' + U.fmtTime(c.start) + "–" + U.fmtTime(c.end) + '</span>' +
        '</button>' +
        '<div class="chunk-body">' +
          '<div class="chunk-title"><span class="num">' + U.pad2(c.index + 1) + '</span> Часть ' + (c.index + 1) +
            '<span class="dur">' + Math.round(c.dur) + ' с</span></div>' +
          '<p class="chunk-desc skeleton">Анализирую кадры…</p>' +
          '<div class="tags"></div>' +
          '<div class="chunk-actions">' +
            '<button class="btn btn-small" data-act="play" type="button">Смотреть</button>' +
            '<button class="btn btn-small btn-ghost" data-act="download" type="button">Скачать</button>' +
            '<button class="btn btn-small btn-ghost" data-act="bake" type="button">С рекламой</button>' +
            '<button class="btn btn-small btn-ghost" data-act="copy" type="button" aria-label="Копировать описание">Копировать</button>' +
          '</div>' +
        '</div>';
      els.chunks.appendChild(card);
    });
  }

  function updateChunkCard(index) {
    const c = state.chunks[index];
    const card = els.chunks.querySelector('[data-index="' + index + '"]');
    if (!c || !card) return;
    const thumb = card.querySelector(".chunk-thumb");
    const ph = thumb.querySelector(".ph");
    if (c.thumb) {
      if (!thumb.querySelector("img")) {
        if (ph) ph.remove();
        const img = document.createElement("img");
        img.alt = "Превью части " + (index + 1);
        img.loading = "lazy";
        img.src = c.thumb;
        thumb.insertBefore(img, thumb.firstChild);
      }
    } else if (ph) {
      ph.textContent = "превью недоступно";
    }
    const desc = card.querySelector(".chunk-desc");
    desc.classList.remove("skeleton");
    desc.textContent = c.text || "Без описания";
    const tags = card.querySelector(".tags");
    tags.innerHTML = "";
    (c.tags || []).forEach(function (t) {
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = t;
      tags.appendChild(s);
    });
  }

  function renderTimeline() {
    els.timeline.innerHTML = "";
    state.chunks.forEach(function (c, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg" + (i === state.active ? " active" : "") + (state.ad ? "" : " no-ad");
      b.dataset.index = i;
      b.style.flexGrow = String(c.dur);
      b.title = "Часть " + (i + 1) + ": " + U.fmtTime(c.start) + "–" + U.fmtTime(c.end);
      b.innerHTML = '<span class="seg-fill"></span><span class="seg-ad"></span><span class="seg-label">' + (i + 1) + '</span>';
      els.timeline.appendChild(b);
    });
  }

  els.timeline.addEventListener("click", function (e) {
    const b = e.target.closest(".seg");
    if (!b) return;
    playChunk(Number(b.dataset.index));
  });

  els.chunks.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest(".chunk");
    const i = Number(card.dataset.index);
    const act = btn.dataset.act;
    if (act === "play") playChunk(i);
    else if (act === "download") downloadChunk(i);
    else if (act === "bake") bakeChunk(i);
    else if (act === "copy") copyChunk(i);
  });

  /* ---------------- text ---------------- */
  function chunkText(c) {
    const lines = [];
    lines.push("ЧАСТЬ " + (c.index + 1) + " · " + U.fmtTime(c.start) + "–" + U.fmtTime(c.end) + " (" + Math.round(c.dur) + " с)");
    lines.push(c.text || "Описание недоступно");
    if (c.tags && c.tags.length) lines.push("Теги: " + c.tags.join(", "));
    if (state.ad) {
      lines.push("Реклама: " + U.fmtTime(c.mid) + "–" + U.fmtTime(c.mid + state.ad.duration) + " (" + state.ad.file.name + ")");
    } else {
      lines.push("Реклама: не добавлена");
    }
    return lines.join("\n");
  }

  function copyChunk(i) {
    const c = state.chunks[i];
    if (!c) return;
    U.copyText(chunkText(c));
  }

  function copyAll() {
    if (!state.file) return;
    const head = [
      "НАРЕЗКА: " + state.file.name,
      "Длительность: " + U.fmtTime(state.duration) + " · Частей: " + state.chunks.length,
      "Реклама: " + (state.ad ? state.ad.file.name + " (" + U.fmtTime(state.ad.duration) + "), в середине каждой части" : "не добавлена")
    ].join("\n");
    const body = state.chunks.map(chunkText).join("\n\n");
    U.copyText(head + "\n\n" + body);
  }

  $("#copyAllBtn").addEventListener("click", copyAll);
  $("#downloadAllBtn").addEventListener("click", downloadAll);

  /* ---------------- ad ---------------- */
  els.adUploadBtn.addEventListener("click", function () { els.adInput.click(); });
  $("#adReplaceBtn").addEventListener("click", function () { els.adInput.click(); });

  els.adInput.addEventListener("change", function () {
    const file = els.adInput.files && els.adInput.files[0];
    els.adInput.value = "";
    if (file) loadAd(file);
  });

  const adPreviewVideo = document.createElement("video");
  adPreviewVideo.muted = true;
  adPreviewVideo.loop = true;
  adPreviewVideo.playsInline = true;
  adPreviewVideo.setAttribute("playsinline", "");
  adPreviewVideo.preload = "auto";
  adPreviewVideo.style.cssText = "position:fixed;left:-8px;bottom:-8px;width:2px;height:2px;opacity:.001;pointer-events:none;z-index:-1";
  document.body.appendChild(adPreviewVideo);

  const previewKeyer = new ChromaKeyer(els.adPreview);
  previewKeyer.setVideo(adPreviewVideo);
  previewKeyer.setParams(state.key);

  async function loadAd(file) {
    if (!isVideo(file)) {
      U.toast("Нужен видеофайл рекламы", "error");
      return;
    }
    let meta;
    try {
      meta = await Media.loadFile(file);
    } catch (e) {
      U.toast("Не удалось прочитать рекламу", "error");
      return;
    }
    if (state.ad) {
      URL.revokeObjectURL(state.ad.url);
    }
    state.ad = { file: file, url: meta.url, duration: meta.duration, width: meta.width, height: meta.height };
    els.adBody.hidden = false;
    els.adName.textContent = file.name;
    els.adInfo.textContent = U.fmtTime(meta.duration) + " · " + meta.width + "×" + meta.height + " · " + U.fmtBytes(file.size);
    els.adPreviewEmpty.hidden = true;
    els.adUploadBtn.textContent = "Заменить рекламу";

    adPreviewVideo.src = meta.url;
    try { await adPreviewVideo.play(); } catch (e) { /* ignore */ }
    previewKeyer.start();
    previewKeyer.renderFrame();

    player.setAd(meta.url, meta.duration);
    renderTimeline();
    onChunkShown(state.active, state.chunks[state.active] || { midRel: 0 });
    if (!state.chunks.length) {
      els.playerAdHint.hidden = true;
    }

    U.toast("Реклама добавлена: " + U.fmtTime(meta.duration));
    assistant.notify("Реклама «" + file.name + "» загружена. Зелёный фон убирается автоматически, вставка — ровно в середину каждой части. Можно подкрутить порог, если видна кайма.");
  }

  $("#adRemoveBtn").addEventListener("click", function () {
    if (state.ad) URL.revokeObjectURL(state.ad.url);
    state.ad = null;
    adPreviewVideo.pause();
    adPreviewVideo.removeAttribute("src");
    try { adPreviewVideo.load(); } catch (e) { /* ignore */ }
    previewKeyer.stop();
    const gl = previewKeyer.gl;
    if (gl) gl.clear(gl.COLOR_BUFFER_BIT);
    els.adBody.hidden = true;
    els.adPreviewEmpty.hidden = false;
    els.adUploadBtn.textContent = "Загрузить рекламу";
    player.setAd(null, 0);
    if (player.phase === "ad") player._stopAd(true);
    renderTimeline();
    onChunkShown(state.active, state.chunks[state.active] || { midRel: 0 });
    U.toast("Реклама удалена");
  });

  els.keySimilarity.addEventListener("input", function () {
    const v = Number(els.keySimilarity.value);
    els.keySimilarityOut.textContent = v.toFixed(2);
    state.key.sim = v;
    previewKeyer.setParams(state.key);
    player.keyer.setParams(state.key);
  });
  els.keySmooth.addEventListener("input", function () {
    const v = Number(els.keySmooth.value);
    els.keySmoothOut.textContent = v.toFixed(2);
    state.key.smooth = v;
    previewKeyer.setParams(state.key);
    player.keyer.setParams(state.key);
  });

  /* ---------------- transport ---------------- */
  els.playToggle.addEventListener("click", function () { player.unlockAd(); player.toggle(); });
  els.bigPlay.addEventListener("click", function (e) { e.stopPropagation(); player.unlockAd(); player.toggle(); });
  els.player.addEventListener("click", function (e) {
    if (e.target.closest("#bigPlay")) return;
    player.unlockAd();
    player.toggle();
  });
  $("#muteToggle").addEventListener("click", function () {
    const muted = player.setMuted(!player.muted);
    $("#muteWave").style.opacity = muted ? ".25" : "1";
  });
  $("#prevChunk").addEventListener("click", function () {
    if (!state.chunks.length) return;
    playChunk(state.active - 1);
  });
  $("#nextChunk").addEventListener("click", function () {
    if (!state.chunks.length) return;
    playChunk(state.active + 1);
  });

  document.addEventListener("keydown", function (e) {
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.code === "Space") {
      e.preventDefault();
      player.toggle();
    } else if (e.code === "ArrowRight" && state.chunks.length) {
      playChunk(state.active + 1);
    } else if (e.code === "ArrowLeft" && state.chunks.length) {
      playChunk(state.active - 1);
    }
  });

  /* ---------------- export ---------------- */
  async function withExport(title, fn) {
    if (state.exporting) {
      U.toast("Дождитесь окончания обработки");
      return;
    }
    if (!state.file) {
      U.toast("Сначала загрузите видео", "error");
      return;
    }
    state.exporting = true;
    showJob(title);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      U.toast("Ошибка обработки", "error");
      assistant.notify("Не получилось обработать файл: " + String(e && e.message || e).slice(0, 300));
    } finally {
      state.exporting = false;
      hideJob();
    }
  }

  function outName(i, suffix) {
    return U.baseName(state.file.name) + "-part-" + U.pad2(i + 1) + (suffix || "") + ".mp4";
  }

  function downloadChunk(i) {
    const c = state.chunks[i];
    if (!c) return;
    withExport("Готовлю часть " + (i + 1), async function () {
      const blob = await exporter.cut({ file: state.file, chunk: c, onStatus: function (t, p, d) { jobProgress(p, d); } });
      U.downloadBlob(blob, outName(i));
      U.toast("Часть " + (i + 1) + " скачана");
    });
  }

  function bakeChunk(i) {
    const c = state.chunks[i];
    if (!c) return;
    if (!state.ad) {
      U.toast("Сначала загрузите рекламу", "error");
      openAdPanel();
      return;
    }
    withExport("Вклеиваю рекламу в часть " + (i + 1), async function () {
      const blob = await exporter.bake({
        file: state.file,
        chunk: c,
        adFile: state.ad.file,
        adDur: state.ad.duration,
        key: state.key,
        width: state.width,
        height: state.height,
        onStatus: function (t, p, d) { jobProgress(p, d); }
      });
      U.downloadBlob(blob, outName(i, "-with-ad"));
      U.toast("Часть " + (i + 1) + " с рекламой скачана");
    });
  }

  async function downloadAll() {
    if (!state.chunks.length) return;
    const n = state.chunks.length;
    for (let i = 0; i < n; i++) {
      let ok = true;
      await withExport("Скачиваю часть " + (i + 1) + " из " + n, async function () {
        try {
          const blob = await exporter.cut({ file: state.file, chunk: state.chunks[i], onStatus: function (t, p, d) { jobProgress(p, d); } });
          U.downloadBlob(blob, outName(i));
        } catch (e) {
          ok = false;
          throw e;
        }
      });
      if (!ok) break;
      await U.sleep(700);
    }
    U.toast("Готово: " + n + " файлов");
  }

  els.jobCancel.addEventListener("click", hideJob);

  /* ---------------- mobile chat ---------------- */
  function openRail() {
    els.rail.classList.add("open");
    if (window.matchMedia("(max-width: 900px)").matches) els.scrim.hidden = false;
    setTimeout(function () { els.chatInput.focus(); }, 260);
  }
  function closeRail() {
    els.rail.classList.remove("open");
    els.scrim.hidden = true;
  }
  els.chatToggle.addEventListener("click", openRail);
  els.railClose.addEventListener("click", closeRail);
  els.scrim.addEventListener("click", closeRail);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeRail();
  });

  window.__narezka = { state: state, player: player, exporter: exporter };
})();
