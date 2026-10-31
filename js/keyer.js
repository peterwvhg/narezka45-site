(function () {
  "use strict";

  function ChromaKeyer(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.sim = 0.26;
    this.smooth = 0.08;
    this.spill = 0.4;
    this.video = null;
    this.running = false;
    this._raf = 0;
    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power"
    }) || canvas.getContext("experimental-webgl");
    if (!gl) return;
    this.gl = gl;

    const vsSrc = [
      "attribute vec2 aPos;",
      "uniform vec2 uScale;",
      "varying vec2 vUv;",
      "void main(){",
      "  vUv = aPos * 0.5 + 0.5;",
      "  gl_Position = vec4(aPos * uScale, 0.0, 1.0);",
      "}"
    ].join("\n");

    const fsSrc = [
      "precision highp float;",
      "varying vec2 vUv;",
      "uniform sampler2D uTex;",
      "uniform float uSim;",
      "uniform float uSmooth;",
      "uniform float uSpill;",
      "void main(){",
      "  vec4 c = texture2D(uTex, vUv);",
      "  float dom = c.g - max(c.r, c.b);",
      "  float a = 1.0 - smoothstep(uSim - uSmooth, uSim + uSmooth, dom);",
      "  float g = mix(c.g, min(c.g, max(c.r, c.b)), uSpill * (1.0 - a));",
      "  gl_FragColor = vec4(c.r * a, g * a, c.b * a, a);",
      "}"
    ].join("\n");

    const compile = function (type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    this.program = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uScale = gl.getUniformLocation(prog, "uScale");
    this.uSim = gl.getUniformLocation(prog, "uSim");
    this.uSmooth = gl.getUniformLocation(prog, "uSmooth");
    this.uSpill = gl.getUniformLocation(prog, "uSpill");
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    this.tex = tex;
    this.ok = true;

    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(canvas);
    } else {
      window.addEventListener("resize", this._onResize);
    }
    this._onResize();
  }

  ChromaKeyer.prototype.setVideo = function (video) {
    this.video = video;
  };

  ChromaKeyer.prototype.setParams = function (p) {
    if (typeof p.sim === "number") this.sim = p.sim;
    if (typeof p.smooth === "number") this.smooth = p.smooth;
    if (typeof p.spill === "number") this.spill = p.spill;
  };

  ChromaKeyer.prototype._onResize = function () {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round((this.canvas.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.round((this.canvas.clientHeight || 1) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  };

  ChromaKeyer.prototype.renderFrame = function () {
    if (!this.ok) return;
    const gl = this.gl;
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    this._onResize();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw < 2 || ch < 2) return;

    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const videoAR = vw / vh;
    const canvasAR = cw / ch;
    let sx = 1, sy = 1;
    if (videoAR > canvasAR) sy = canvasAR / videoAR;
    else sx = videoAR / canvasAR;

    gl.viewport(0, 0, cw, ch);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.uScale, sx, sy);
    gl.uniform1f(this.uSim, this.sim);
    gl.uniform1f(this.uSmooth, this.smooth);
    gl.uniform1f(this.uSpill, this.spill);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch (e) { return; }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  ChromaKeyer.prototype._loop = function () {
    if (!this.running) return;
    this.renderFrame();
    this._raf = requestAnimationFrame(this._loop);
  };

  ChromaKeyer.prototype.start = function () {
    if (!this.ok || this.running) return;
    this.running = true;
    this._loop();
  };

  ChromaKeyer.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.ok) {
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };

  window.ChromaKeyer = ChromaKeyer;
})();
