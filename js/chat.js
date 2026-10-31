(function () {
  "use strict";

  const ORDINALS = [
    ["перв", 1], ["втор", 2], ["трет", 3], ["четверт", 4], ["пят", 5],
    ["шест", 6], ["седьм", 7], ["восьм", 8], ["девят", 9], ["десят", 10]
  ];

  function Assistant(opts) {
    this.logEl = opts.log;
    this.form = opts.form;
    this.input = opts.input;
    this.chipsEl = opts.chips;
    this.state = opts.state;
    this.act = opts.actions;
    this.onSend = opts.onSend || function () {};
    this.messages = [];
    this._bind();
    this.chips(["Список частей", "Описание 2 части", "Где реклама?", "Скачать все"]);
  }

  Assistant.prototype._bind = function () {
    const self = this;
    this.form.addEventListener("submit", function (e) {
      e.preventDefault();
      const text = self.input.value.trim();
      if (!text) return;
      self.input.value = "";
      self.user(text);
      self.handle(text);
    });
    this.chipsEl.addEventListener("click", function (e) {
      const b = e.target.closest(".chip");
      if (!b) return;
      self.user(b.textContent);
      self.handle(b.textContent);
    });
  };

  Assistant.prototype.chips = function (list) {
    this.chipsEl.innerHTML = "";
    const self = this;
    list.forEach(function (t) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = t;
      self.chipsEl.appendChild(b);
    });
  };

  Assistant.prototype._scroll = function () {
    this.logEl.scrollTop = this.logEl.scrollHeight;
  };

  Assistant.prototype._bubble = function (role, text, tools) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    if (tools && tools.length) {
      const bar = document.createElement("div");
      bar.className = "msg-tools";
      tools.forEach(function (t) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t.label;
        b.addEventListener("click", function () {
          try { t.onClick(); } catch (e) { /* ignore */ }
        });
        bar.appendChild(b);
      });
      wrap.appendChild(bar);
    }
    this.logEl.appendChild(wrap);
    this._scroll();
    this.messages.push({ role: role, text: text });
  };

  Assistant.prototype.user = function (text) {
    this._bubble("user", text);
  };

  Assistant.prototype.say = function (text, tools) {
    this._bubble("bot", text, tools);
  };

  Assistant.prototype.notify = function (text, tools) {
    this.say(text, tools);
  };

  Assistant.prototype._num = function (text, max) {
    const m = text.match(/(\d{1,3})/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= max) return n;
    }
    for (let i = 0; i < ORDINALS.length; i++) {
      if (text.indexOf(ORDINALS[i][0]) !== -1) {
        const n = ORDINALS[i][1];
        if (n <= max) return n;
      }
    }
    return 0;
  };

  Assistant.prototype.handle = function (raw) {
    const st = this.state();
    const text = raw.toLowerCase().replace(/ё/g, "е");
    const chunks = st.chunks || [];
    const has = chunks.length > 0;

    if (/^(привет|здравств|хай|добрый)/.test(text)) {
      this.say(has
        ? "Привет! Видео разложено на " + U.parts(chunks.length) + ". Спросите про любую: «описание 3 части», «включи 2», «скачай все»."
        : "Привет! Загрузите видео — я разложу его на части по 45 секунд, покажу превью и описание, а рекламу поставлю ровно в середину каждой части.");
      return;
    }

    if (/спасибо|благодар/.test(text)) {
      this.say("Пожалуйста. Если нужно — скажите номер части, и я включу или скачаю её.");
      return;
    }

    if (!has && !/реклам/.test(text)) {
      this.say("Сначала загрузите видео. Нажмите «Выбрать видео» на главном экране — дальше я всё разложу сам.", [
        { label: "Выбрать видео", onClick: this.act.pickVideo }
      ]);
      return;
    }

    if (/реклам|зелен|хромак|фон/.test(text)) {
      if (!st.ad) {
        this.say("Реклама пока не загружена. Нажмите «Загрузить рекламу» — снимите ролик на зелёном фоне, я уберу фон и поставлю его ровно в середину каждой части. Видео в этот момент стоит на паузе.", [
          { label: "Загрузить рекламу", onClick: this.act.pickAd }
        ]);
      } else {
        const mid = chunks[0] ? (chunks[0].midRel) : 0;
        this.say("Реклама «" + st.ad.name + "» (" + U.fmtTime(st.ad.duration) + ") уже стоит в середине каждой части — например, в первой на " + U.fmtTime(mid) + ". Видео останавливается, реклама играет с прозрачным фоном, потом видео продолжается.\n\nПорог зелёного и мягкость края можно подкрутить в блоке «Реклама».", [
          { label: "Настроить рекламу", onClick: this.act.openAdPanel }
        ]);
      }
      return;
    }

    if (/склей|смен[аы]? план|смен план|сколько план|монтаж/.test(text)) {
      const n = chunks.length;
      const totalCuts = chunks.reduce(function (s, c) { return s + (c.stats ? c.stats.cuts : 0); }, 0);
      this.say("Всего " + n + " ч. и примерно " + totalCuts + " смен плана. " +
        chunks.map(function (c) { return "ч." + (c.index + 1) + " — " + (c.stats ? c.stats.cuts : 0); }).join(", ") + ".");
      return;
    }

    if (/сколько|длитель|длина|хронометраж/.test(text)) {
      this.say("Ролик " + U.fmtTime(st.duration) + ", это " + U.parts(chunks.length) + " по 45 секунд" +
        (chunks.length && chunks[chunks.length - 1].dur < 44.9 ? " (последняя — " + Math.round(chunks[chunks.length - 1].dur) + " с)." : ".") +
        "\nРеклама: " + (st.ad ? "есть, " + U.fmtTime(st.ad.duration) + ", в середине каждой части." : "не загружена."));
      return;
    }

    if (/список|какие част|какие куск|все част|раздели|нарезк/.test(text) && !/скач|сохран|копир|опис/.test(text)) {
      const lines = chunks.map(function (c) {
        return "• Часть " + (c.index + 1) + " — " + U.fmtTime(c.start) + "–" + U.fmtTime(c.end) + " (" + Math.round(c.dur) + " с)";
      });
      this.say("Части:\n" + lines.join("\n"), chunks.slice(0, 4).map(function (c) {
        return { label: "Часть " + (c.index + 1), onClick: function () { st.play(c.index); } };
      }));
      return;
    }

    const idx = this._num(text, chunks.length || 99);

    if (/скопир/.test(text)) {
      if (idx) {
        st.copyChunk(idx - 1);
        this.say("Скопировал описание части " + idx + ". Вставьте в заметки или в описание ролика.");
      } else if (/все|весь|текст/.test(text)) {
        st.copyAll();
        this.say("Скопировал весь текст: название, таймкоды и описания всех частей.");
      } else {
        st.copyChunk(st.active);
        this.say("Скопировал описание части " + (st.active + 1) + ".");
      }
      return;
    }

    if (/скач|сохран|выгруз/.test(text)) {
      if (/все|весь/.test(text)) {
        this.say("Запускаю скачивание всех частей. Первый раз движок грузится ~31 МБ, потом каждая часть готовится отдельно — это может занять время.");
        st.downloadAll();
        return;
      }
      if (idx) {
        this.say("Готовлю часть " + idx + " к скачиванию. Через минуту файл скачается сам.");
        st.downloadChunk(idx - 1);
        return;
      }
      this.say("Какую часть скачать? Напишите номер, например «скачай 2». Или скачайте все части.", [
        { label: "Скачать все", onClick: st.downloadAll }
      ]);
      return;
    }

    if (/опис|что в|расскажи|анализ|превью|про част|о част/.test(text)) {
      const i = idx ? idx - 1 : st.active;
      const c = chunks[i];
      if (!c) { this.say("Такой части нет. Всего " + chunks.length + "."); return; }
      const body = c.text || "Ещё анализирую кадры — описание появится через несколько секунд.";
      this.say("Часть " + (c.index + 1) + " · " + U.fmtTime(c.start) + "–" + U.fmtTime(c.end) + "\n" + body +
        "\nТеги: " + (c.tags && c.tags.length ? c.tags.join(", ") : "—"), [
        { label: "Смотреть", onClick: function () { st.play(c.index); } },
        { label: "Копировать", onClick: function () { st.copyChunk(c.index); } },
        { label: "Скачать", onClick: function () { st.downloadChunk(c.index); } }
      ]);
      return;
    }

    if (/включ|играй|смотр|проигр|открой|запусти|переключ/.test(text)) {
      const i = idx ? idx - 1 : st.active;
      const c = chunks[i];
      if (!c) { this.say("Такой части нет. Всего " + chunks.length + "."); return; }
      st.play(c.index);
      this.say("Включаю часть " + (c.index + 1) + " (" + U.fmtTime(c.start) + "–" + U.fmtTime(c.end) + "). В середине будет реклама, видео на паузе.");
      return;
    }

    if (/реклам|зелен|хромак|фон/.test(text)) {
      this.say("Реклама вставляется ровно в середину каждой части. Зелёный фон убирается на лету, без сервера — прямо в браузере.");
      return;
    }

    if (/как|помог|что умеешь|команд/.test(text)) {
      this.help();
      return;
    }

    // fallback: если есть номер — покажем описание
    if (idx) {
      const c = chunks[idx - 1];
      if (c) {
        this.say("Часть " + idx + " · " + U.fmtTime(c.start) + "–" + U.fmtTime(c.end) + "\n" + (c.text || "Анализирую…"), [
          { label: "Смотреть", onClick: function () { st.play(c.index); } },
          { label: "Скачать", onClick: function () { st.downloadChunk(c.index); } }
        ]);
        return;
      }
    }

    this.help();
  };

  Assistant.prototype.help = function () {
    this.say("Могу так:\n• «список частей» — все таймкоды\n• «описание 2 части» — что в кадре\n• «включи 3» — запустить часть\n• «скачай 2» или «скачай все» — сохранить видео\n• «скопируй текст» — описание в буфер\n• «где реклама?» — настройки вставки");
  };

  window.Assistant = Assistant;
})();
