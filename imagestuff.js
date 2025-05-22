class ThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'system';
    this.themeToggle = document.getElementById('themeToggle');
    this.themeIndicator = document.getElementById('themeIndicator');
    
    this.initializeTheme();
    this.setupEventListeners();
  }

  initializeTheme() {
    // Set initial theme
    this.applyTheme(this.currentTheme);
    this.updateThemeIndicator();
    
    // Listen for system theme changes
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        if (this.currentTheme === 'system') {
          this.applyTheme('system');
        }
      });
    }
  }

  setupEventListeners() {
    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', (e) => {
        const themeOption = e.target.closest('.theme-option');
        if (themeOption) {
          const theme = themeOption.dataset.theme;
          this.setTheme(theme);
        }
      });
    }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme(theme);
    this.updateThemeIndicator();
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  updateThemeIndicator() {
    // Remove active class from all options
    const allOptions = this.themeToggle.querySelectorAll('.theme-option');
    allOptions.forEach(option => option.classList.remove('active'));
    
    // Add active class to current theme
    const activeOption = this.themeToggle.querySelector(`[data-theme="${this.currentTheme}"]`);
    if (activeOption) {
      activeOption.classList.add('active');
      
      // Move indicator
      const index = Array.from(allOptions).indexOf(activeOption);
      const indicatorPosition = index * 40 + 4; // 40px width + 4px padding
      this.themeIndicator.style.transform = `translateX(${indicatorPosition}px)`;
    }
  }
}

class LUTProcessor {
  constructor() {
    this.imageFile = null;
    this.lutFile = null;
    this.lutData = null;
    this.canvas = document.getElementById('resultCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Fixed: Initialize both file states
    this.hasValidImage = false;
    this.hasValidLUT = false;

    this.initializeEventListeners();
    this.setupDragAndDrop();
  }

  initializeEventListeners() {
    const imageInput = document.getElementById('imageInput');
    const lutInput = document.getElementById('lutInput');
    const processBtn = document.getElementById('processBtn');
    const helpFab = document.getElementById('helpFab');

    if (imageInput) {
      imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
    }
    if (lutInput) {
      lutInput.addEventListener('change', (e) => this.handleLUTUpload(e));
    }
    if (processBtn) {
      processBtn.addEventListener('click', () => this.processImage());
    }
    if (helpFab) {
      helpFab.addEventListener('click', () => this.showHelp());
    }

    console.log('event listeners initialized');
  }

  setupDragAndDrop() {
    const imageUploadArea = document.getElementById('imageUploadArea');
    const lutUploadArea = document.getElementById('lutUploadArea');

    // Image drag and drop
    if (imageUploadArea) {
      this.setupDropZone(imageUploadArea, (files) => {
        if (files[0] && files[0].type.startsWith('image/')) {
          this.handleImageFile(files[0]);
        }
      });
    }

    // LUT drag and drop
    if (lutUploadArea) {
      this.setupDropZone(lutUploadArea, (files) => {
        if (files[0] && files[0].name.endsWith('.cube')) {
          this.handleLUTFile(files[0]);
        }
      });
    }
  }

  setupDropZone(element, onDrop) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (e) => {
      e.preventDefault();
      if (!element.contains(e.relatedTarget)) {
        element.classList.remove('drag-over');
      }
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');
      onDrop(e.dataTransfer.files);
    });
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.handleImageFile(file);
  }

  handleImageFile(file) {
    console.log('image upload handler called');
    this.imageFile = file;
    this.hasValidImage = true; // Fixed: Set flag immediately
    console.log('image file set:', file.name);

    // Update card state
    const imageCard = document.getElementById('imageCard');
    imageCard.classList.add('has-file');

    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    preview.appendChild(img);

    // Fixed: Update button immediately after setting the flag
    this.updateProcessButton();
  }

  async handleLUTUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    await this.handleLUTFile(file);
  }

  async handleLUTFile(file) {
    console.log('lut upload handler called');
    this.lutFile = file;
    console.log('lut file set:', file.name);

    // Update card state
    const lutCard = document.getElementById('lutCard');
    lutCard.classList.add('has-file');

    try {
      const text = await file.text();
      this.lutData = this.parseLUT(text);
      this.hasValidLUT = true; // Fixed: Set flag after successful parsing
      console.log('lut parsed successfully:', this.lutData);

      const info = document.getElementById('lutInfo');
      info.innerHTML = `
        <strong>✓ lut loaded successfully</strong><br>
        <strong>size:</strong> ${this.lutData.size}³<br>
        <strong>title:</strong> ${this.lutData.title || 'unknown'}<br>
        <strong>entries:</strong> ${this.lutData.data.length}
      `;
    } catch (error) {
      console.error('error parsing lut:', error);
      this.hasValidLUT = false; // Fixed: Reset flag on error
      this.showError('error reading lut file: ' + error.message);
      return;
    }

    // Fixed: Update button after setting the flag
    this.updateProcessButton();
  }

  parseLUT(text) {
    const lines = text.split('\n').map((line) => line.trim());
    let size = 33; // Default size
    let title = '';
    const data = [];

    for (let line of lines) {
      if (line.startsWith('#')) continue; // Skip comments
      if (line === '') continue; // Skip empty lines

      if (line.startsWith('TITLE')) {
        title = line.substring(5).trim().replace(/"/g, '');
      } else if (line.startsWith('LUT_3D_SIZE')) {
        size = parseInt(line.split(' ')[1]);
      } else if (line.match(/^[\d\.\-\s]+$/)) {
        // Data line with RGB values (including negative numbers)
        const values = line.split(/\s+/).filter((v) => v !== '');
        if (values.length >= 3) {
          data.push({
            r: parseFloat(values[0]),
            g: parseFloat(values[1]),
            b: parseFloat(values[2]),
          });
        }
      }
    }

    console.log(`lut parsing: expected ${size}³ = ${size * size * size} entries, got ${data.length}`);

    if (data.length !== size * size * size) {
      throw new Error(
        `invalid lut data. expected ${
          size * size * size
        } entries, got ${data.length}`
      );
    }

    return { size, title, data };
  }

  updateProcessButton() {
    const btn = document.getElementById('processBtn');
    // Fixed: Use the reliable flags instead of checking objects
    const canProcess = this.hasValidImage && this.hasValidLUT;
    
    console.log('updating process button:', {
      hasValidImage: this.hasValidImage,
      hasValidLUT: this.hasValidLUT,
      canProcess
    });

    if (btn) {
      btn.disabled = !canProcess;
    }
  }

  async processImage() {
    console.log('processing image...');
    if (!this.hasValidImage || !this.hasValidLUT) {
      console.error('missing image or lut data');
      return;
    }

    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }

    try {
      // Load image
      const img = await this.loadImage(this.imageFile);
      console.log('image loaded:', img.width, 'x', img.height);

      // Set canvas size
      this.canvas.width = img.width;
      this.canvas.height = img.height;

      // Draw original image
      this.ctx.drawImage(img, 0, 0);

      // Get image data
      const imageData = this.ctx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      // Apply LUT
      console.log('applying lut...');
      this.applyLUTToImageData(imageData);

      // Put processed data back
      this.ctx.putImageData(imageData, 0, 0);

      // Show result
      const resultSection = document.getElementById('resultSection');
      if (resultSection) {
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });
      }

      // Auto-download
      this.downloadImage();
    } catch (error) {
      console.error('error processing image:', error);
      this.showError('error processing image: ' + error.message);
    } finally {
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }
  }

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  applyLUTToImageData(imageData) {
    const data = imageData.data;
    const lutSize = this.lutData.size;
    const lutData = this.lutData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Normalize RGB values to 0-1 range
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Apply LUT
      const result = this.interpolateLUT(r, g, b, lutSize, lutData);

      // Convert back to 0-255 range and clamp
      data[i] = Math.max(0, Math.min(255, Math.round(result.r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(result.g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(result.b * 255)));
      // Alpha channel remains unchanged
    }
  }

  interpolateLUT(r, g, b, size, lutData) {
    // Clamp values
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));

    // Scale to LUT coordinates
    const lutR = r * (size - 1);
    const lutG = g * (size - 1);
    const lutB = b * (size - 1);

    // Get integer and fractional parts
    const rFloor = Math.floor(lutR);
    const gFloor = Math.floor(lutG);
    const bFloor = Math.floor(lutB);

    const rCeil = Math.min(size - 1, rFloor + 1);
    const gCeil = Math.min(size - 1, gFloor + 1);
    const bCeil = Math.min(size - 1, bFloor + 1);

    const rFrac = lutR - rFloor;
    const gFrac = lutG - gFloor;
    const bFrac = lutB - bFloor;

    // Get the 8 corner values for trilinear interpolation
    const getIndex = (r, g, b) => r * size * size + g * size + b;

    const c000 = lutData[getIndex(rFloor, gFloor, bFloor)];
    const c001 = lutData[getIndex(rFloor, gFloor, bCeil)];
    const c010 = lutData[getIndex(rFloor, gCeil, bFloor)];
    const c011 = lutData[getIndex(rFloor, gCeil, bCeil)];
    const c100 = lutData[getIndex(rCeil, gFloor, bFloor)];
    const c101 = lutData[getIndex(rCeil, gFloor, bCeil)];
    const c110 = lutData[getIndex(rCeil, gCeil, bFloor)];
    const c111 = lutData[getIndex(rCeil, gCeil, bCeil)];

    // Trilinear interpolation
    const c00 = this.lerp(c000, c001, bFrac);
    const c01 = this.lerp(c010, c011, bFrac);
    const c10 = this.lerp(c100, c101, bFrac);
    const c11 = this.lerp(c110, c111, bFrac);

    const c0 = this.lerp(c00, c01, gFrac);
    const c1 = this.lerp(c10, c11, gFrac);

    return this.lerp(c0, c1, rFrac);
  }

  lerp(a, b, t) {
    return {
      r: a.r + t * (b.r - a.r),
      g: a.g + t * (b.g - a.g),
      b: a.b + t * (b.b - a.b),
    };
  }

  downloadImage() {
    const link = document.createElement('a');
    link.download = `lut_processed_${Date.now()}.png`;
    link.href = this.canvas.toDataURL();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  showError(message) {
    // Simple error display - you could enhance this with a Material snackbar
    alert(message);
  }

  showHelp() {
    const helpText = `
luthor help:

🎨 theme options:
• light mode: clean light interface
• dark mode: easy on the eyes
• system: follows your device settings

📁 how to use:
1. upload an image (jpeg, png, webp)
2. upload a .cube lut file
3. click "apply lut & download" to process
4. your processed image will download automatically

🎞️ about luts:
lut (look-up table) files contain color grading information used in professional video and photo editing.

supported formats:
• images: jpeg, png, webp
• lut: .cube format
    `;
    
    alert(helpText);
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('dom loaded, initializing applications...');
  new ThemeManager();
  new LUTProcessor();
});