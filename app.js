import { PALETTES } from './palettes.js';

const grid = document.getElementById('color-grid');
const paletteList = document.getElementById('palette-list');
const sortRadios = document.querySelectorAll('input[name="sort"]');
const exportBtn = document.getElementById('export-pdf');
const overlay = document.getElementById('overlay');
const overlayName = document.getElementById('overlay-name');
const overlayHex = document.getElementById('overlay-hex');
const overlayClose = document.getElementById('overlay-close');

// Track which palettes are checked
const checkedPalettes = new Set();

// --- Utility: hex → [h, s, l] ---
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, l];
}

// --- Utility: relative luminance for contrast ---
function relativeLuminance(hex) {
  const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastColor(hex) {
  return relativeLuminance(hex) > 0.35 ? '#000000' : '#ffffff';
}

// --- Utility: hex → CIE Lab ---
function hexToLab(hex) {
  const toLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const L = 116 * f(Y) - 16;
  const A = 500 * (f(X) - f(Y));
  const B = 200 * (f(Y) - f(Z));
  return [L, A, B];
}

function deltaE(hex1, hex2) {
  const [L1, a1, b1] = hexToLab(hex1);
  const [L2, a2, b2] = hexToLab(hex2);
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

function matchLabel(de) {
  if (de < 5)  return 'Excellent';
  if (de < 15) return 'Good';
  if (de < 30) return 'Fair';
  return 'Distant';
}

// --- Collect + sort colors ---
function getSortMode() {
  for (const r of sortRadios) { if (r.checked) return r.value; }
  return 'none';
}

function getColors() {
  let colors = [];
  for (const name of checkedPalettes) {
    colors = colors.concat(PALETTES[name]);
  }
  const mode = getSortMode();
  if (mode === 'hue') {
    colors = [...colors].sort((a, b) => hexToHsl(a.hex)[0] - hexToHsl(b.hex)[0]);
  } else if (mode === 'lightness') {
    colors = [...colors].sort((a, b) => hexToHsl(a.hex)[2] - hexToHsl(b.hex)[2]);
  } else if (mode === 'name') {
    colors = [...colors].sort((a, b) => a.name.localeCompare(b.name));
  } else if (mode === 'saturation') {
    colors = [...colors].sort((a, b) => hexToHsl(a.hex)[1] - hexToHsl(b.hex)[1]);
  }
  return colors;
}

// --- Color matcher ---
const matchInput   = document.getElementById('match-input');
const matchPreview = document.getElementById('match-preview');
const matchResults = document.getElementById('match-results');

function isValidHex(v) { return /^#[0-9a-fA-F]{6}$/.test(v); }

function renderMatcher() {
  const raw = matchInput.value.trim();
  const hex = raw.startsWith('#') ? raw : '#' + raw;
  if (!isValidHex(hex)) {
    matchPreview.style.background = '';
    matchPreview.style.display = 'none';
    matchResults.innerHTML = '';
    return;
  }
  matchPreview.style.background = hex;
  matchPreview.style.display = 'block';

  const allColors = [];
  for (const name of checkedPalettes) allColors.push(...PALETTES[name]);

  if (allColors.length === 0) {
    matchResults.innerHTML = '<p class="match-empty">Select a palette first.</p>';
    return;
  }

  const scored = allColors
    .map(c => ({ ...c, de: deltaE(hex, c.hex) }))
    .sort((a, b) => a.de - b.de)
    .slice(0, 5);

  matchResults.innerHTML = scored.map(c => `
    <div class="match-row">
      <span class="match-dot" style="background:${c.hex}"></span>
      <span class="match-name" title="${c.name}">${c.name}</span>
      <span class="match-label match-label--${matchLabel(c.de).toLowerCase()}">${matchLabel(c.de)}</span>
    </div>
  `).join('');
}

matchInput.addEventListener('input', renderMatcher);

// --- Image color picker ---
const imageUploadBtn     = document.getElementById('image-upload-btn');
const imageUpload        = document.getElementById('image-upload');
const imageUploadGallery = document.getElementById('image-upload-gallery');
const imagePickerWrap    = document.getElementById('image-picker-wrap');
const imagePickerCanvas  = document.getElementById('image-picker-canvas');
const imagePickerClear   = document.getElementById('image-picker-clear');

const uploadActionSheet   = document.getElementById('upload-action-sheet');
const uploadActionBackdrop = uploadActionSheet.querySelector('.upload-action-backdrop');
const actionCamera        = document.getElementById('action-camera');
const actionGallery       = document.getElementById('action-gallery');
const actionCancel        = document.getElementById('action-cancel');

const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

function showUploadActionSheet() {
  uploadActionSheet.style.display = 'block';
  uploadActionSheet.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => uploadActionSheet.classList.add('is-visible'));
}

function hideUploadActionSheet() {
  uploadActionSheet.classList.remove('is-visible');
  uploadActionSheet.setAttribute('aria-hidden', 'true');
  setTimeout(() => { uploadActionSheet.style.display = 'none'; }, 250);
}

imageUploadBtn.addEventListener('click', () => {
  if (isMobile()) {
    showUploadActionSheet();
  } else {
    imageUpload.click();
  }
});

actionCamera.addEventListener('click', () => {
  hideUploadActionSheet();
  imageUpload.click();
});

actionGallery.addEventListener('click', () => {
  hideUploadActionSheet();
  imageUploadGallery.click();
});

actionCancel.addEventListener('click', hideUploadActionSheet);
uploadActionBackdrop.addEventListener('click', hideUploadActionSheet);

function handleImageFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxW = 168, maxH = 140;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    imagePickerCanvas.width  = Math.round(img.width  * scale);
    imagePickerCanvas.height = Math.round(img.height * scale);
    imagePickerCanvas.getContext('2d').drawImage(img, 0, 0, imagePickerCanvas.width, imagePickerCanvas.height);
    URL.revokeObjectURL(url);
    imagePickerWrap.style.display = 'block';
    imageUploadBtn.style.display  = 'none';
  };
  img.src = url;
}

imageUpload.addEventListener('change', () => {
  handleImageFile(imageUpload.files[0]);
  imageUpload.value = '';
});

imageUploadGallery.addEventListener('change', () => {
  handleImageFile(imageUploadGallery.files[0]);
  imageUploadGallery.value = '';
});

// Shared helper: get pixel hex at a mouse event on the canvas
function canvasHexAt(e) {
  const rect = imagePickerCanvas.getBoundingClientRect();
  const scaleX = imagePickerCanvas.width  / rect.width;
  const scaleY = imagePickerCanvas.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top)  * scaleY);
  const [r, g, b] = imagePickerCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

const pickerHoverSwatch = document.getElementById('picker-hover-swatch');
const pickerHoverColor  = document.getElementById('picker-hover-color');
const pickerHoverHex    = document.getElementById('picker-hover-hex');

imagePickerCanvas.addEventListener('mousemove', e => {
  const hex = canvasHexAt(e);
  pickerHoverColor.style.background = hex;
  pickerHoverHex.textContent = hex.toUpperCase();
  pickerHoverSwatch.style.left = (e.clientX + 14) + 'px';
  pickerHoverSwatch.style.top  = (e.clientY + 14) + 'px';
  pickerHoverSwatch.style.display = 'flex';
});

imagePickerCanvas.addEventListener('mouseleave', () => {
  pickerHoverSwatch.style.display = 'none';
});

imagePickerCanvas.addEventListener('click', e => {
  const hex = canvasHexAt(e);
  pickerHoverSwatch.style.display = 'none';
  matchInput.value = hex;
  matchInput.dispatchEvent(new Event('input')); // triggers renderMatcher
});

imagePickerClear.addEventListener('click', () => {
  imagePickerWrap.style.display = 'none';
  imageUploadBtn.style.display  = 'block';
  pickerHoverSwatch.style.display = 'none';
  matchInput.value = '';
  matchInput.dispatchEvent(new Event('input'));
});

// --- Render grid ---
function render() {
  const colors = getColors();
  grid.innerHTML = '';
  if (colors.length === 0) {
    grid.innerHTML = '<p class="empty-state">Select a palette to view colors.</p>';
    return;
  }
  for (const color of colors) {
    const wrap = document.createElement('div');
    wrap.className = 'swatch-wrap';

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color.hex;
    swatch.dataset.hex = color.hex;
    swatch.dataset.name = color.name;

    swatch.addEventListener('click', () => {
      overlay.style.background = color.hex;
      overlayName.textContent = color.name;
      overlayHex.textContent = color.hex.toUpperCase();
      const contrast = getContrastColor(color.hex);
      overlayName.style.color = contrast;
      overlayHex.style.color = contrast;
      overlayClose.style.color = contrast;
      overlay.style.display = 'flex';
    });

    const label = document.createElement('div');
    label.className = 'swatch-name';
    label.textContent = color.name;
    label.title = color.name;

    wrap.appendChild(swatch);
    wrap.appendChild(label);
    grid.appendChild(wrap);
  }
}

// --- Build sidebar palette checkboxes ---
function buildSidebar() {
  for (const name of Object.keys(PALETTES)) {
    const item = document.createElement('div');
    item.className = 'palette-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `palette-${name}`;
    cb.checked = true;
    checkedPalettes.add(name);

    cb.addEventListener('change', () => {
      if (cb.checked) checkedPalettes.add(name);
      else checkedPalettes.delete(name);
      render();
      renderMatcher();
    });

    const lbl = document.createElement('label');
    lbl.htmlFor = `palette-${name}`;
    lbl.textContent = name;

    item.appendChild(cb);
    item.appendChild(lbl);
    paletteList.appendChild(item);
  }
}

// --- Overlay dismiss ---
overlay.addEventListener('click', () => { overlay.style.display = 'none'; });

// --- Mobile sidebar toggle ---
const sidebarToggle   = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const sidebar         = document.querySelector('.sidebar');

function closeSidebar() {
  sidebar.classList.remove('is-open');
  sidebarBackdrop.classList.remove('is-open');
}

function openSidebar() {
  sidebar.classList.add('is-open');
  sidebarBackdrop.classList.add('is-open');
}

// Open immediately on mobile — suppress the slide animation on cold load
if (window.innerWidth <= 768) {
  sidebar.classList.add('no-transition');
  openSidebar();
  requestAnimationFrame(() => sidebar.classList.remove('no-transition'));
}

const sidebarClose = document.getElementById('sidebar-close');

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('is-open');
  sidebarBackdrop.classList.toggle('is-open');
});
sidebarBackdrop.addEventListener('click', closeSidebar);
sidebarClose.addEventListener('click', closeSidebar);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    overlay.style.display = 'none';
    closeSidebar();
  }
});

// --- Sort radios ---
sortRadios.forEach(r => r.addEventListener('change', () => { render(); renderMatcher(); }));

// --- PDF Export ---
exportBtn.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const colors = getColors();
  if (colors.length === 0) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const cols = 6;
  const swatchSize = 70;
  const gap = 12;
  const marginTop = 48;
  const marginLeft = 40;
  const rowHeight = swatchSize + 20; // swatch + name space

  const paletteName = [...checkedPalettes].join(' + ') || 'Palette';

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text(paletteName, marginLeft, 28);

  let x = marginLeft;
  let y = marginTop;
  let col = 0;

  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const hex = color.hex.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Check if we need a new page
    if (y + rowHeight > pageHeight - 20) {
      doc.addPage();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(paletteName + ' (cont.)', marginLeft, 28);
      x = marginLeft;
      y = marginTop;
      col = 0;
    }

    // Draw rounded rectangle
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y, swatchSize, swatchSize, 6, 6, 'F');

    // Color name below
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const nameText = doc.splitTextToSize(color.name, swatchSize);
    doc.text(nameText[0], x + swatchSize / 2, y + swatchSize + 10, { align: 'center' });

    col++;
    if (col >= cols) {
      col = 0;
      x = marginLeft;
      y += rowHeight + gap;
    } else {
      x += swatchSize + gap;
    }
  }

  const filename = paletteName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-palette.pdf';
  doc.save(filename);
});

// --- Init ---
buildSidebar();
render();
renderMatcher();
