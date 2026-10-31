(function () {
  "use strict";
  const U = {};

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };
  U.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  U.pad2 = function (n) { return String(n).padStart(2, "0"); };

  U.fmtTime = function (sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const t = Math.floor(sec);
    const s = t % 60;
    const m = Math.floor(t / 60) % 60;
    const h = Math.floor(t / 3600);
    if (h > 0) return h + ":" + U.pad2(m) + ":" + U.pad2(s);
    return U.pad2(m) + ":" + U.pad2(s);
  };

  U.fmtBytes = function (bytes) {
    if (!bytes) return "0 Б";
    const units = ["Б", "КБ", "МБ", "ГБ"];
    let i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)) + " " + units[i];
  };

  U.baseName = function (name) {
    return (name || "video").replace(/\.[^.]+$/, "") || "video";
  };

  U.plural = function (n, one, few, many) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  U.parts = function (n) {
    return n + " " + U.plural(n, "часть", "части", "частей");
  };

  U.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  U.copyText = async function (text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        U.toast("Скопировано");
        return true;
      }
      throw new Error("no clipboard");
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-1000px;left:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        ta.remove();
        if (ok) { U.toast("Скопировано"); return true; }
      } catch (e2) { /* ignore */ }
      U.toast("Не удалось скопировать", "error");
      return false;
    }
  };

  let toastTimer = 0;
  U.toast = function (msg, kind) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast show" + (kind === "error" ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "toast"; }, 2600);
  };

  U.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 90000);
  };

  U.downloadText = function (text, filename) {
    U.downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
  };

  U.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Не загрузился скрипт: " + src)); };
      document.head.appendChild(s);
    });
  };

  U.seekTo = function (video, time, timeout) {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener("seeked", finish);
        resolve(true);
      };
      const timer = setTimeout(finish, timeout || 2600);
      video.addEventListener("seeked", finish, { once: true });
      try { video.currentTime = time; } catch (e) { finish(); }
    });
  };

  U.waitEvent = function (el, name, timeout) {
    return new Promise(function (resolve, reject) {
      let done = false;
      const ok = function () { if (done) return; done = true; clearTimeout(t); el.removeEventListener(name, ok); el.removeEventListener("error", bad); resolve(); };
      const bad = function () { if (done) return; done = true; clearTimeout(t); el.removeEventListener(name, ok); el.removeEventListener("error", bad); reject(new Error("Ошибка чтения файла")); };
      const t = setTimeout(function () { if (!done) { done = true; el.removeEventListener(name, ok); el.removeEventListener("error", bad); reject(new Error("Таймаут чтения файла")); } }, timeout || 15000);
      el.addEventListener(name, ok);
      el.addEventListener("error", bad);
    });
  };

  window.U = U;
})();
