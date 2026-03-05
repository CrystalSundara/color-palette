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
const imageUploadBtn    = document.getElementById('image-upload-btn');
const imageUpload       = document.getElementById('image-upload');
const imagePickerWrap   = document.getElementById('image-picker-wrap');
const imagePickerCanvas = document.getElementById('image-picker-canvas');
const imagePickerClear  = document.getElementById('image-picker-clear');
const imagePickerZoom   = document.getElementById('image-picker-zoom');

// Zoom/pan state
let pickerImg  = null;
let pickerZoom = 1;
let pickerPanX = 0;
let pickerPanY = 0;
let pickerDragging  = false;
let pickerDragStart = {};
let pickerPointerMoved = false;
let pickerPinchDist = null;

imageUploadBtn.addEventListener('click', () => {
  imageUpload.click();
});

function drawPickerCanvas() {
  const ctx = imagePickerCanvas.getContext('2d');
  const viewW = pickerImg.width  / pickerZoom;
  const viewH = pickerImg.height / pickerZoom;
  pickerPanX = Math.max(0, Math.min(pickerImg.width  - viewW, pickerPanX));
  pickerPanY = Math.max(0, Math.min(pickerImg.height - viewH, pickerPanY));
  ctx.clearRect(0, 0, imagePickerCanvas.width, imagePickerCanvas.height);
  ctx.drawImage(pickerImg, pickerPanX, pickerPanY, viewW, viewH,
                           0, 0, imagePickerCanvas.width, imagePickerCanvas.height);
  if (pickerZoom > 1.05) {
    imagePickerZoom.textContent = pickerZoom.toFixed(1) + '×';
    imagePickerZoom.style.display = 'block';
  } else {
    imagePickerZoom.style.display = 'none';
  }
  imagePickerCanvas.style.cursor = pickerZoom > 1 ? 'grab' : 'crosshair';
}

function handleImageFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxW = 168, maxH = 140;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    imagePickerCanvas.width  = Math.round(img.width  * scale);
    imagePickerCanvas.height = Math.round(img.height * scale);
    pickerImg  = img;
    pickerZoom = 1;
    pickerPanX = 0;
    pickerPanY = 0;
    drawPickerCanvas();
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
  if (pickerDragging) return;
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
  if (pickerDragging) return;
  const hex = canvasHexAt(e);
  pickerHoverSwatch.style.display = 'none';
  matchInput.value = hex;
  matchInput.dispatchEvent(new Event('input'));
});

// Mouse wheel zoom
imagePickerCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (!pickerImg) return;
  const rect = imagePickerCanvas.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;
  const imgX = pickerPanX + (cssX / rect.width)  * (pickerImg.width  / pickerZoom);
  const imgY = pickerPanY + (cssY / rect.height) * (pickerImg.height / pickerZoom);
  const factor = e.deltaY < 0 ? 1.25 : 0.8;
  pickerZoom = Math.max(1, Math.min(8, pickerZoom * factor));
  pickerPanX = imgX - (cssX / rect.width)  * (pickerImg.width  / pickerZoom);
  pickerPanY = imgY - (cssY / rect.height) * (pickerImg.height / pickerZoom);
  drawPickerCanvas();
}, { passive: false });

// Mouse drag pan
imagePickerCanvas.addEventListener('mousedown', e => {
  if (pickerZoom <= 1) return;
  pickerDragging = true;
  pickerDragStart = { x: e.clientX, y: e.clientY, panX: pickerPanX, panY: pickerPanY };
  imagePickerCanvas.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', e => {
  if (!pickerDragging || !pickerImg) return;
  const rect = imagePickerCanvas.getBoundingClientRect();
  const dx = (e.clientX - pickerDragStart.x) / rect.width  * (pickerImg.width  / pickerZoom);
  const dy = (e.clientY - pickerDragStart.y) / rect.height * (pickerImg.height / pickerZoom);
  pickerPanX = pickerDragStart.panX - dx;
  pickerPanY = pickerDragStart.panY - dy;
  drawPickerCanvas();
  pickerHoverSwatch.style.display = 'none';
});

document.addEventListener('mouseup', () => {
  if (pickerDragging) {
    pickerDragging = false;
    imagePickerCanvas.style.cursor = pickerZoom > 1 ? 'grab' : 'crosshair';
  }
});

// Double-click to reset zoom
imagePickerCanvas.addEventListener('dblclick', () => {
  pickerZoom = 1; pickerPanX = 0; pickerPanY = 0;
  drawPickerCanvas();
});

// Touch support: pinch zoom + single-finger pan
imagePickerCanvas.addEventListener('touchstart', e => {
  pickerPointerMoved = false;
  if (e.touches.length === 2) {
    pickerPinchDist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY
    );
  } else if (e.touches.length === 1 && pickerZoom > 1) {
    pickerDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY,
                        panX: pickerPanX, panY: pickerPanY };
  }
}, { passive: true });

imagePickerCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  pickerPointerMoved = true;
  if (e.touches.length === 2 && pickerPinchDist !== null) {
    const dist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY
    );
    const ratio = dist / pickerPinchDist;
    const rect = imagePickerCanvas.getBoundingClientRect();
    const midCssX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
    const midCssY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
    const imgX = pickerPanX + (midCssX / rect.width)  * (pickerImg.width  / pickerZoom);
    const imgY = pickerPanY + (midCssY / rect.height) * (pickerImg.height / pickerZoom);
    pickerZoom = Math.max(1, Math.min(8, pickerZoom * ratio));
    pickerPanX = imgX - (midCssX / rect.width)  * (pickerImg.width  / pickerZoom);
    pickerPanY = imgY - (midCssY / rect.height) * (pickerImg.height / pickerZoom);
    pickerPinchDist = dist;
    drawPickerCanvas();
    pickerHoverSwatch.style.display = 'none';
  } else if (e.touches.length === 1) {
    if (pickerZoom > 1) {
      const rect = imagePickerCanvas.getBoundingClientRect();
      const dx = (e.touches[0].clientX - pickerDragStart.x) / rect.width  * (pickerImg.width  / pickerZoom);
      const dy = (e.touches[0].clientY - pickerDragStart.y) / rect.height * (pickerImg.height / pickerZoom);
      pickerPanX = pickerDragStart.panX - dx;
      pickerPanY = pickerDragStart.panY - dy;
      drawPickerCanvas();
      pickerHoverSwatch.style.display = 'none';
    } else {
      const touch = e.touches[0];
      const hex = canvasHexAt({ clientX: touch.clientX, clientY: touch.clientY });
      pickerHoverColor.style.background = hex;
      pickerHoverHex.textContent = hex.toUpperCase();
      pickerHoverSwatch.style.left = (touch.clientX + 14) + 'px';
      pickerHoverSwatch.style.top  = (touch.clientY + 14) + 'px';
      pickerHoverSwatch.style.display = 'flex';
    }
  }
}, { passive: false });

let pickerLastTap = 0;
imagePickerCanvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (e.touches.length < 2) pickerPinchDist = null;
  const now = Date.now();
  if (now - pickerLastTap < 300 && !pickerPointerMoved) {
    pickerZoom = 1; pickerPanX = 0; pickerPanY = 0;
    drawPickerCanvas();
  } else if (e.touches.length === 0 && !pickerPointerMoved) {
    const touch = e.changedTouches[0];
    const hex = canvasHexAt({ clientX: touch.clientX, clientY: touch.clientY });
    pickerHoverSwatch.style.display = 'none';
    matchInput.value = hex;
    matchInput.dispatchEvent(new Event('input'));
  } else {
    pickerHoverSwatch.style.display = 'none';
  }
  pickerLastTap = now;
});

imagePickerClear.addEventListener('click', () => {
  imagePickerWrap.style.display = 'none';
  imageUploadBtn.style.display  = 'block';
  pickerHoverSwatch.style.display = 'none';
  pickerZoom = 1; pickerPanX = 0; pickerPanY = 0; pickerImg = null;
  imagePickerZoom.style.display = 'none';
  matchInput.value = '';
  matchInput.dispatchEvent(new Event('input'));
});

// --- Render grid ---
function render() {
  const colors = getColors();
  grid.innerHTML = '';
  if (colors.length === 0) {
    grid.innerHTML = '<p class="empty-state">Tap ≡ to browse palettes.</p>';
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


// Open sidebar immediately on mobile (z-index is now safe — toggle is 600, backdrop is 450)
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
