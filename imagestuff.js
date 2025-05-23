// imagestuff.js

class ThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'system';
    this.toggleEl = document.getElementById('themeToggle');
    this.indicator = document.getElementById('themeIndicator');
    this.initializeTheme();
    this.setupListeners();
  }

  initializeTheme() {
    this.apply(this.currentTheme);
    this.updateIndicator();
    // Fix: ensure indicator is correct after DOM is painted
    setTimeout(() => this.updateIndicator(), 0);
    window.addEventListener('load', () => this.updateIndicator());
    window.addEventListener('resize', () => this.updateIndicator());
    if (window.matchMedia) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (this.currentTheme === 'system') {
            this.apply('system');
            this.updateIndicator();
          }
        });
    }
  }

  setupListeners() {
    if (!this.toggleEl) return;
    this.toggleEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-option');
      if (!btn) return;
      this.set(btn.dataset.theme);
    });
  }

  set(theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.apply(theme);
    this.updateIndicator();
  }

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  updateIndicator() {
    if (!this.toggleEl || !this.indicator) return;
    const opts = Array.from(
      this.toggleEl.querySelectorAll('.theme-option')
    );
    opts.forEach((o) => o.classList.remove('active'));
    const active = this.toggleEl.querySelector(
      `.theme-option[data-theme="${this.currentTheme}"]`
    );
    if (!active) return;
    active.classList.add('active');
    // Dynamically set indicator width and position
    const rect = active.getBoundingClientRect();
    const parentRect = this.toggleEl.getBoundingClientRect();
    this.indicator.style.width = rect.width + 'px';
    this.indicator.style.left = (rect.left - parentRect.left) + 'px';
    this.indicator.style.boxShadow = getComputedStyle(active).boxShadow;
  }
}

class LUTProcessor {
  constructor() {
    this.imageFile = null;
    this.lutFile = null;
    this.lutData = null;
    this.hasValidImage = false;
    this.hasValidLUT = false;
    this.axisOrder = 'bSlowest';
    this.canvas = document.getElementById('resultCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.resultReady = false;
    this.initializeListeners();
    this.setupDragAndDrop();
  }

  initializeListeners() {
    const imgIn = document.getElementById('imageInput');
    const lutIn = document.getElementById('lutInput');
    const applyBtn = document.getElementById('applyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const helpFab = document.getElementById('helpFab');

    imgIn?.addEventListener('change', (e) => this.onImageChange(e));
    lutIn?.addEventListener('change', (e) => this.onLUTChange(e));
    applyBtn?.addEventListener('click', () => this.processImage());
    downloadBtn?.addEventListener('click', () => this.downloadImage());
    helpFab?.addEventListener('click', () => this.showHelp());
  }

  setupDragAndDrop() {
    const imgArea = document.getElementById('imageUploadArea');
    const lutArea = document.getElementById('lutUploadArea');
    if (imgArea) this.makeDropZone(imgArea, (f) => this.onImageFile(f[0]));
    if (lutArea) this.makeDropZone(lutArea, (f) => this.onLUTFile(f[0]));
  }

  makeDropZone(el, handler) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', (e) => {
      e.preventDefault();
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove('drag-over');
      }
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      handler(e.dataTransfer.files);
    });
  }

  onImageChange(evt) {
    const f = evt.target.files[0];
    if (f) this.onImageFile(f);
  }

  onLUTChange(evt) {
    const f = evt.target.files[0];
    if (f) this.onLUTFile(f);
  }

  onImageFile(file) {
    if (!file.type.startsWith('image/')) return;
    this.imageFile = file;
    this.hasValidImage = true;
    this.resultReady = false;
    document.getElementById('imageCard')?.classList.add('has-file');
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    preview.appendChild(img);
    this.updateProcessButtons();
  }

  async onLUTFile(file) {
    if (!file.name.toLowerCase().endsWith('.cube')) return;
    this.lutFile = file;
    this.resultReady = false;
    document.getElementById('lutCard')?.classList.add('has-file');
    let text;
    try {
      text = await file.text();
    } catch (err) {
      this.showError('error reading lut file: ' + err.message);
      this.hasValidLUT = false;
      return;
    }
    try {
      this.lutData = this.parseLUT(text);
      this.hasValidLUT = true;
      this.detectAxisOrder();
    } catch (err) {
      this.showError('invalid lut data: ' + err.message);
      this.hasValidLUT = false;
      return;
    }
    const info = document.getElementById('lutInfo');
    info.innerHTML = `
      <strong>✓ lut loaded successfully</strong><br>
      <strong>size:</strong> ${this.lutData.size}³<br>
      <strong>title:</strong> ${this.lutData.title || 'unknown'}<br>
      <strong>entries:</strong> ${this.lutData.data.length}
    `;
    this.updateProcessButtons();
  }

  parseLUT(text) {
    const lines = text.split('\n').map((l) => l.trim());
    let size = 33,
      title = '',
      domainMin = { r: 0, g: 0, b: 0 },
      domainMax = { r: 1, g: 1, b: 1 };
    const data = [];
    for (let line of lines) {
      if (!line || line.startsWith('#')) continue;
      const p = line.split(/\s+/);
      if (p[0] === 'TITLE') {
        title = line.substring(5).replace(/"/g, '');
      } else if (p[0] === 'LUT_3D_SIZE') {
        size = parseInt(p[1]);
      } else if (p[0] === 'DOMAIN_MIN') {
        domainMin = { r: +p[1], g: +p[2], b: +p[3] };
      } else if (p[0] === 'DOMAIN_MAX') {
        domainMax = { r: +p[1], g: +p[2], b: +p[3] };
      } else if (p.length === 3 && p.every((v) => /^-?[\d.]+$/.test(v))) {
        data.push({ r: +p[0], g: +p[1], b: +p[2] });
      }
    }
    if (data.length !== size * size * size) {
      throw new Error(
        `expected ${size ** 3} color entries, got ${data.length}`
      );
    }
    return { size, title, data, domainMin, domainMax };
  }

  detectAxisOrder() {
    const { size, data, domainMin, domainMax } = this.lutData;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const sampleErr = (order) => {
      let r = 1, g = 1, b = 1;
      r = domainMin.r + r * (domainMax.r - domainMin.r);
      g = domainMin.g + g * (domainMax.g - domainMin.g);
      b = domainMin.b + b * (domainMax.b - domainMin.b);
      r = clamp(r); g = clamp(g); b = clamp(b);
      const lr = r * (size - 1),
        lg = g * (size - 1),
        lb = b * (size - 1);
      const r0 = Math.floor(lr),
        g0 = Math.floor(lg),
        b0 = Math.floor(lb);
      const r1 = Math.min(size - 1, r0 + 1),
        g1 = Math.min(size - 1, g0 + 1),
        b1 = Math.min(size - 1, b0 + 1);
      const rf = lr - r0,
        gf = lg - g0,
        bf = lb - b0;
      const idx = (ri, gi, bi) =>
        order === 'bSlowest'
          ? bi * size * size + gi * size + ri
          : ri * size * size + gi * size + bi;
      const c000 = data[idx(r0, g0, b0)];
      const c001 = data[idx(r0, g0, b1)];
      const c010 = data[idx(r0, g1, b0)];
      const c011 = data[idx(r0, g1, b1)];
      const c100 = data[idx(r1, g0, b0)];
      const c101 = data[idx(r1, g0, b1)];
      const c110 = data[idx(r1, g1, b0)];
      const c111 = data[idx(r1, g1, b1)];
      const lerp = (a, b, t) => ({
        r: a.r + t * (b.r - a.r),
        g: a.g + t * (b.g - a.g),
        b: a.b + t * (b.b - a.b),
      });
      const c00 = lerp(c000, c001, bf);
      const c01 = lerp(c010, c011, bf);
      const c10 = lerp(c100, c101, bf);
      const c11 = lerp(c110, c111, bf);
      const c0 = lerp(c00, c01, gf);
      const c1 = lerp(c10, c11, gf);
      const out = lerp(c0, c1, rf);
      return Math.abs(out.r - 1) + Math.abs(out.g - 1) + Math.abs(out.b - 1);
    };
    const errB = sampleErr('bSlowest');
    const errR = sampleErr('rSlowest');
    this.axisOrder = errR < errB ? 'rSlowest' : 'bSlowest';
  }

  updateProcessButtons() {
    const applyBtn = document.getElementById('applyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const canApply = this.hasValidImage && this.hasValidLUT;
    if (applyBtn) applyBtn.disabled = !canApply;
    if (downloadBtn) downloadBtn.disabled = !this.resultReady;
  }

  async processImage() {
    if (!this.hasValidImage || !this.hasValidLUT) return;
    document.getElementById('progressContainer').style.display = 'block';
    try {
      const img = await this.loadImage(this.imageFile);
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      const imageData = this.ctx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      this.applyLUT(imageData);
      this.ctx.putImageData(imageData, 0, 0);
      document.getElementById('resultSection').style.display = 'block';
      document
        .getElementById('resultSection')
        .scrollIntoView({ behavior: 'smooth' });
      this.resultReady = true;
      this.updateProcessButtons();
    } catch (err) {
      this.showError('error processing image: ' + err.message);
    } finally {
      document.getElementById('progressContainer').style.display = 'none';
    }
  }

  loadImage(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        res(img);
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  applyLUT(imageData) {
    const d = imageData.data;
    const { size, data: lutData, domainMin, domainMax } = this.lutData;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const idxFn = (ri, gi, bi) =>
      this.axisOrder === 'bSlowest'
        ? bi * size * size + gi * size + ri
        : ri * size * size + gi * size + bi;
    const lerp = (a, b, t) => ({
      r: a.r + t * (b.r - a.r),
      g: a.g + t * (b.g - a.g),
      b: a.b + t * (b.b - a.b),
    });
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] / 255;
      let g = d[i + 1] / 255;
      let b = d[i + 2] / 255;
      r = domainMin.r + r * (domainMax.r - domainMin.r);
      g = domainMin.g + g * (domainMax.g - domainMin.g);
      b = domainMin.b + b * (domainMax.b - domainMin.b);
      r = clamp(r);
      g = clamp(g);
      b = clamp(b);
      const lr = r * (size - 1),
        lg = g * (size - 1),
        lb = b * (size - 1);
      const r0 = Math.floor(lr),
        g0 = Math.floor(lg),
        b0 = Math.floor(lb);
      const r1 = Math.min(size - 1, r0 + 1),
        g1 = Math.min(size - 1, g0 + 1),
        b1 = Math.min(size - 1, b0 + 1);
      const rf = lr - r0,
        gf = lg - g0,
        bf = lb - b0;
      const c000 = lutData[idxFn(r0, g0, b0)];
      const c001 = lutData[idxFn(r0, g0, b1)];
      const c010 = lutData[idxFn(r0, g1, b0)];
      const c011 = lutData[idxFn(r0, g1, b1)];
      const c100 = lutData[idxFn(r1, g0, b0)];
      const c101 = lutData[idxFn(r1, g0, b1)];
      const c110 = lutData[idxFn(r1, g1, b0)];
      const c111 = lutData[idxFn(r1, g1, b1)];
      const c00 = lerp(c000, c001, bf);
      const c01 = lerp(c010, c011, bf);
      const c10 = lerp(c100, c101, bf);
      const c11 = lerp(c110, c111, bf);
      const c0 = lerp(c00, c01, gf);
      const c1 = lerp(c10, c11, gf);
      const out = lerp(c0, c1, rf);
      d[i] = Math.round(out.r * 255);
      d[i + 1] = Math.round(out.g * 255);
      d[i + 2] = Math.round(out.b * 255);
    }
  }

  downloadImage() {
    if (!this.resultReady) return;
    const link = document.createElement('a');
    link.download = `lut_processed_${Date.now()}.png`;
    link.href = this.canvas.toDataURL();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  showError(msg) {
    alert(msg);
  }

  showHelp() {
    alert(`
luthor help:

🎨 theme options:
• light mode: clean light interface
• dark mode: easy on the eyes
• system: follows your device

📁 how to use:
1. upload an image (jpeg, png, webp)
2. upload a .cube lut file
3. click "apply"
4. click "download" to save your processed image

🎞️ about luts:
lut (look-up table) files contain color grading data.
    `);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ThemeManager();
  new LUTProcessor();
});
