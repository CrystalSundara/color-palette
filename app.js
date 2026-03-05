import { PALETTES } from './palettes.js';

const grid = document.getElementById('color-grid');
const paletteList = document.getElementById('palette-list');
const sortRadios = document.querySelectorAll('input[name="sort"]');
const exportBtn = document.getElementById('export-pdf');
const overlay = document.getElementById('overlay');
const overlayName = document.getElementById('overlay-name');
const overlayHex = document.getElementById('overlay-hex');

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

// --- Hue-family sort key ---
// Returns [familyIndex, hue, lightness] so colors group perceptually:
// 0=Blues, 1=Blue-Purples, 2=Purples/Mauves, 3=Pinks/Roses,
// 4=Deep Pinks, 5=Wines/Berries, 6=Deep Purples, 7=Teals,
// 8=Greens/Sages, 9=Cool Greys, 10=Warm Neutrals, 11=Light Neutrals,
// 12=Darks/Navies (catch-all)
function getFamilySort(hex) {
  const [h, s, l] = hexToHsl(hex);

  // Very low saturation → grey bucket
  if (s < 0.07) {
    if (l > 0.82) return [11, h, l];
    const warm = h > 15 && h < 170;
    return warm ? [10, h, l] : [9, h, l];
  }

  if (l > 0.85) return [11, h, l]; // very light

  if (h >= 195 && h < 250 && l >= 0.38) return [0, h, l]; // Blues
  if (h >= 240 && h < 280 && l >= 0.45) return [1, h, l]; // Blue-Purples
  if (h >= 265 && h < 330 && l >= 0.5)  return [2, h, l]; // Purples/Mauves
  if ((h >= 325 || h < 20) && l >= 0.55) return [3, h, l]; // Light Pinks
  if ((h >= 310 || h < 15) && l >= 0.32 && l < 0.55) return [4, h, l]; // Deep Pinks
  if ((h >= 295 || h < 15) && l < 0.32)  return [5, h, l]; // Wines/Berries
  if (h >= 255 && h < 315)               return [6, h, l]; // Deep Purples
  if (h >= 150 && h < 205 && l >= 0.3)   return [7, h, l]; // Teals
  if (h >= 70  && h < 150 && l >= 0.3)   return [8, h, l]; // Greens/Sages
  if (h >= 15  && h < 70)                return [10, h, l]; // Warm Neutrals

  return [12, h, l]; // Darks/Navies
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
  } else if (mode === 'family') {
    colors = [...colors].sort((a, b) => {
      const [fa, fha, fla] = getFamilySort(a.hex);
      const [fb, fhb, flb] = getFamilySort(b.hex);
      if (fa !== fb) return fa - fb;
      if (fha !== fhb) return fha - fhb;
      return fla - flb;
    });
  }
  return colors;
}

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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') overlay.style.display = 'none';
});

// --- Sort radios ---
sortRadios.forEach(r => r.addEventListener('change', render));

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
