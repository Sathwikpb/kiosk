// =====================================================
//  CMTI AEROSPACE KIOSK — app.js
// =====================================================

// Safely set global worker ONLY if the CDN successfully loaded
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let currentPdf    = null;
let currentPage   = 1;
let totalPages    = 0;
let zoomScale     = 1.0;
let autoZoom      = true;          
let currentFile   = null;          
let allFiles      = [];
let activeCategory = 'All';
let searchQuery    = '';
let selectMode     = false;
let selectedFiles  = new Set();
let renderTask     = null;
let thumbnailsVisible = false;
let pdfDoc        = null;          
let sleepTimer    = null;
const SLEEP_TIMEOUT = 5 * 60 * 1000; 

// Gallery / media state
let galleryFiles   = [];   // current filtered image+video list for lightbox nav
let galleryIndex   = 0;    // current lightbox index

// Attract loop state
let attractFiles   = [];   // all image+video files for attract loop
let attractIndex   = 0;
let attractTimer   = null;
let attractActive  = false;
const ATTRACT_TIMEOUT  = 90 * 1000;  // idle 90s → attract starts
const ATTRACT_INTERVAL = 6000;       // ms per slide

// =====================================================
//  BOOT SEQUENCE
// =====================================================
const bootSteps = [
  [10,  'Loading kernel modules...'],
  [25,  'Mounting filesystems...'],
  [45,  'Starting display server...'],
  [62,  'Initialising UI layer...'],
  [80,  'Connecting to kiosk backend...'],
  [95,  'Loading presentations...'],
  [100, 'System ready.'],
];

async function boot() {
  const fill  = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');
  const status = document.getElementById('splash-status');

  for (const [pct, msg] of bootSteps) {
    fill.style.width  = pct + '%';
    label.textContent = msg;
    status.textContent = msg;

    // Wait for the actual Node backend to be ready at 80%
    if (pct === 80) {
      while (true) {
        try {
          const res = await fetch('/api/files');
          if (res.ok) break;
        } catch (e) {}
        await sleep(500);
      }
    } else {
      await sleep(280 + Math.random() * 220);
    }
  }
  await sleep(400);
  document.getElementById('splash').classList.add('fade-out');
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    showHome();
  }, 1000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Run instantly when DOM is ready, even if offline
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  boot();
  initParticles();
  initDataStreams();
  connectSSE();
  resetSleepTimer();
  document.addEventListener('touchstart', onUserActivity, { passive: true });
  document.addEventListener('mousedown',  onUserActivity);
  document.addEventListener('keydown',    e => { onUserActivity(); handleGlobalKey(e); });
});

// =====================================================
//  CLOCK
// =====================================================
function startClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    document.getElementById('clock-time').textContent = `${h}:${m}:${s}`;
    const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    document.getElementById('clock-date').textContent =
      `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
  tick();
  setInterval(tick, 1000);
}

// =====================================================
//  PARTICLE CANVAS (home background)
// =====================================================
function initParticles() {
  const canvas = document.getElementById('home-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.4 + 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,180,255,${0.06 * (1 - dist/120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,180,255,${p.alpha})`;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// =====================================================
//  DATA STREAMS (side panel decoration)
// =====================================================
function initDataStreams() {
  const chars = '01アイウエオカキクケコサシスセソタチツテト0110HYDRAULICSPRESSURETESTINGMILSTD';
  function makeStream(id) {
    const el = document.getElementById(id);
    if (!el) return;
    let str = '';
    for (let i = 0; i < 60; i++) str += chars[Math.floor(Math.random() * chars.length)] + ' ';
    el.textContent = str;
    setInterval(() => {
      const arr = el.textContent.split('');
      const idx = Math.floor(Math.random() * arr.length);
      arr[idx] = chars[Math.floor(Math.random() * chars.length)];
      el.textContent = arr.join('');
    }, 120);
  }
  ['stream-l1','stream-l2','stream-r1','stream-r2'].forEach(makeStream);
}

// =====================================================
//  SLEEP / WAKE
// =====================================================
function onUserActivity() {
  // Wake from attract loop
  if (attractActive) { stopAttractLoop(); }
  // Wake from sleep
  resetSleepTimer();
}

function resetSleepTimer() {
  clearTimeout(sleepTimer);
  const sleepEl = document.getElementById('sleep');
  if (sleepEl && sleepEl.classList.contains('fade-in')) {
    wakeUp();
  }
  // Schedule attract loop (fires before sleep)
  clearTimeout(window._attractTimer);
  window._attractTimer = setTimeout(() => {
    // Only launch attract if on home screen and media exists
    const homeVisible = !document.getElementById('home').classList.contains('hidden');
    if (homeVisible && !attractActive) startAttractLoop();
  }, ATTRACT_TIMEOUT);
  sleepTimer = setTimeout(goSleep, SLEEP_TIMEOUT);
}

function goSleep() {
  const sleepEl = document.getElementById('sleep');
  sleepEl.classList.remove('hidden');
  requestAnimationFrame(() => sleepEl.classList.add('fade-in'));
}

function wakeUp() {
  const sleepEl = document.getElementById('sleep');
  sleepEl.classList.remove('fade-in');
  setTimeout(() => sleepEl.classList.add('hidden'), 800);
  resetSleepTimer();
}

// =====================================================
//  NAVIGATION
// =====================================================
const SCREENS = ['home','browser','about','enquiry','enquiry-success',
                 'slide-viewer','model-viewer-wrap','image-viewer','video-viewer'];

function hideAllScreens() {
  SCREENS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showHome() {
  hideAllScreens();
  document.getElementById('home').classList.remove('hidden');
  initParticles();
}

function goHome() {
  stopSuccessCountdown();
  closeViewer();
  hideAllScreens();
  document.getElementById('home').classList.remove('hidden');
  // Stop any playing video
  const vid = document.getElementById('video-viewer-el');
  if (vid) { vid.pause(); vid.src = ''; }
  const lv = document.getElementById('lightbox-video');
  if (lv) { lv.pause(); lv.src = ''; }
  document.getElementById('gallery-lightbox').classList.add('hidden');
}

function showBrowser() {
  hideAllScreens();
  document.getElementById('browser').classList.remove('hidden');
  loadFiles();
}

function showAbout() {
  hideAllScreens();
  document.getElementById('about').classList.remove('hidden');
  initCarousel();
}

function showEnquiry() {
  hideAllScreens();
  document.getElementById('enquiry').classList.remove('hidden');
  loadEnquiryCount();
}

// =====================================================
//  SSE — QUEUE STATUS
// =====================================================
function connectSSE() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot) return;
  try {
    const es = new EventSource('/api/queue-status');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.status === 'busy') {
        dot.className = 'status-dot busy';
        text.textContent = `CONVERTING (${data.queue || 0})`;
      } else {
        dot.className = 'status-dot idle';
        text.textContent = 'IDLE';
      }
    };
    es.onerror = () => {
      dot.className = 'status-dot idle';
      text.textContent = 'IDLE';
    };
  } catch(e) {}
}

// =====================================================
//  FILE BROWSER
// =====================================================
async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    allFiles = await res.json();
    updateStats();
    renderGrid();
    toast('Files refreshed', 'info');
  } catch(e) {
    toast('Cannot reach server', 'error');
  }
}

function updateStats() {
  document.getElementById('stat-total').textContent = allFiles.length;
  document.getElementById('stat-pdf').textContent =
    allFiles.filter(f => f.ext === 'pdf').length;
  document.getElementById('stat-3d').textContent =
    allFiles.filter(f => ['glb','gltf','obj','stl'].includes(f.ext)).length;
  // Populate attract loop pool
  attractFiles = allFiles.filter(f => f.mediaType === 'image' || f.mediaType === 'video');
}

function setCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}

function filterFiles() {
  searchQuery = document.getElementById('search-input').value.toLowerCase();
  document.getElementById('search-clear').style.display = searchQuery ? '' : 'none';
  renderGrid();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('search-clear').style.display = 'none';
  renderGrid();
}

function getFilteredFiles() {
  return allFiles.filter(f => {
    const catMatch = activeCategory === 'All' || f.category === activeCategory;
    const q = searchQuery;
    const searchMatch = !q ||
      f.title.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.filename.toLowerCase().includes(q);
    return catMatch && searchMatch;
  });
}

function renderGrid() {
  const grid = document.getElementById('file-grid');
  const files = getFilteredFiles();
  grid.innerHTML = '';

  if (!files.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📂</div>
        <p>${searchQuery ? 'No results for "' + searchQuery + '"' : 'No files in this category'}</p>
        <p style="font-size:0.75rem;opacity:0.5">Upload files using the ⬆ Upload button</p>
      </div>`;
    return;
  }

  // Gallery category → render as media grid
  const isGalleryView = activeCategory === 'Gallery' ||
    files.every(f => f.mediaType === 'image' || f.mediaType === 'video');
  const mediaFiles = files.filter(f => f.mediaType === 'image' || f.mediaType === 'video');

  if (activeCategory === 'Gallery' && mediaFiles.length > 0) {
    grid.classList.add('gallery-grid-mode');
    galleryFiles = mediaFiles;
    mediaFiles.forEach((f, i) => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.style.animationDelay = (i * 20) + 'ms';
      card.dataset.filename = f.filename;

      const isVideo = f.mediaType === 'video';
      card.innerHTML = `
        <div class="gallery-thumb-wrap">
          ${isVideo
            ? `<video src="/files/${encodeURIComponent(f.filename)}" class="gallery-thumb-media" muted preload="metadata"></video><div class="gallery-play-icon">▶</div>`
            : `<img src="/files/${encodeURIComponent(f.filename)}" alt="${escapeHtml(f.title)}" class="gallery-thumb-media" loading="lazy">`
          }
          <div class="gallery-type-badge">${isVideo ? '▶ VIDEO' : '🖼 IMG'}</div>
          ${selectMode ? '<div class="select-indicator">✓</div>' : ''}
        </div>
        <div class="gallery-card-label">${escapeHtml(f.title)}</div>
      `;

      card.addEventListener('click', () => {
        if (selectMode) { toggleSelect(f.filename, card); return; }
        galleryIndex = i;
        openLightbox(f, i);
      });

      grid.appendChild(card);
    });
    return;
  }

  grid.classList.remove('gallery-grid-mode');
  const icons = { pdf: '📄', glb: '⬡', gltf: '⬡', obj: '⬡', stl: '⬡',
                  jpg:'🖼', jpeg:'🖼', png:'🖼', webp:'🖼', gif:'🖼',
                  mp4:'▶', webm:'▶', mov:'▶' };
  const catClass = (c) => 'cat-' + c.replace(/\s+/g, '-');

  files.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.animationDelay = (i * 30) + 'ms';
    card.dataset.filename = f.filename;

    // Thumbnail preview for images in non-gallery views
    const thumbHtml = f.mediaType === 'image'
      ? `<div class="card-thumb"><img src="/files/${encodeURIComponent(f.filename)}" alt="" loading="lazy"></div>`
      : `<div class="card-icon">${icons[f.ext] || '📄'}</div>`;

    card.innerHTML = `
      <div class="select-indicator">✓</div>
      <div class="card-top">
        <span class="cat-tag ${catClass(f.category)}">${f.category}</span>
        <span class="file-ext-tag">${f.ext.toUpperCase()}</span>
      </div>
      ${thumbHtml}
      <div class="card-title">${escapeHtml(f.title)}</div>
      <div class="card-filename">${escapeHtml(f.filename)}</div>
    `;

    card.addEventListener('click', () => {
      if (selectMode) {
        toggleSelect(f.filename, card);
      } else {
        openFile(f);
      }
    });

    grid.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// =====================================================
//  SELECT MODE
// =====================================================
function toggleSelectMode() {
  selectMode = true;
  selectedFiles.clear();
  document.getElementById('delete-btn').classList.add('hidden');
  document.getElementById('confirm-delete-btn').classList.remove('hidden');
  document.getElementById('cancel-select-btn').classList.remove('hidden');
  document.getElementById('selected-count').textContent = '0';
  document.querySelectorAll('.file-card').forEach(c => c.classList.add('selectable'));
}

function cancelSelectMode() {
  selectMode = false;
  selectedFiles.clear();
  document.getElementById('delete-btn').classList.remove('hidden');
  document.getElementById('confirm-delete-btn').classList.add('hidden');
  document.getElementById('cancel-select-btn').classList.add('hidden');
  document.querySelectorAll('.file-card').forEach(c => {
    c.classList.remove('selectable','selected');
  });
}

function toggleSelect(filename, card) {
  if (selectedFiles.has(filename)) {
    selectedFiles.delete(filename);
    card.classList.remove('selected');
  } else {
    selectedFiles.add(filename);
    card.classList.add('selected');
  }
  document.getElementById('selected-count').textContent = selectedFiles.size;
}

async function confirmDelete() {
  if (!selectedFiles.size) { cancelSelectMode(); return; }
  const n = selectedFiles.size;
  const promises = [...selectedFiles].map(f =>
    fetch('/api/files/' + encodeURIComponent(f), { method: 'DELETE' })
  );
  await Promise.all(promises);
  cancelSelectMode();
  await loadFiles();
  toast(`Deleted ${n} file${n>1?'s':''}`, 'success');
}

// =====================================================
//  FILE OPEN
// =====================================================
function openFile(f) {
  currentFile = f;
  const is3d = ['glb','gltf','obj','stl'].includes(f.ext);
  if (is3d) {
    open3D(f);
  } else if (f.ext === 'pdf') {
    openPDF(f);
  } else if (f.mediaType === 'image') {
    // Find gallery index among all images for nav
    const imgFiles = allFiles.filter(x => x.mediaType === 'image' || x.mediaType === 'video');
    galleryFiles = imgFiles;
    galleryIndex = imgFiles.findIndex(x => x.filename === f.filename);
    openLightbox(f, galleryIndex);
  } else if (f.mediaType === 'video') {
    openVideoViewer(f);
  }
}

// =====================================================
//  3D VIEWER
// =====================================================
function open3D(f) {
  document.getElementById('browser').classList.add('hidden');
  const wrap = document.getElementById('model-viewer-wrap');
  wrap.classList.remove('hidden');
  document.getElementById('model-filename').textContent = f.title;
  document.getElementById('mv').src = '/files/' + encodeURIComponent(f.filename);
}

// =====================================================
//  PDF VIEWER
// =====================================================
async function openPDF(f) {
  document.getElementById('browser').classList.add('hidden');
  const viewer = document.getElementById('slide-viewer');
  viewer.classList.remove('hidden');
  document.getElementById('slide-filename').textContent = f.title;

  currentPage = 1;
  zoomScale   = 1.0;
  autoZoom    = true;
  pdfDoc      = null;
  clearThumbnails();

  showPdfLoader(true);

  try {
    // Fallback: Dynamically import PDF.js if the global CDN script failed to load (offline scenario)
    if (typeof pdfjsLib === 'undefined') {
      window.pdfjsLib = await import('https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
    }

    pdfDoc = await pdfjsLib.getDocument('/files/' + encodeURIComponent(f.filename)).promise;
    currentPdf = pdfDoc;
    totalPages = pdfDoc.numPages;
    await renderPage(currentPage);
    buildThumbnails();
    showPdfLoader(false);
    toast(f.title, 'info');
  } catch(e) {
    showPdfLoader(false);
    toast('Could not load PDF', 'error');
    console.error("PDF Load Error:", e);
  }
}

async function renderPage(n) {
  if (!pdfDoc) return;
  if (renderTask) { renderTask.cancel(); renderTask = null; }

  const canvas = document.getElementById('pdf-canvas');
  canvas.classList.add('loading-canvas');

  const page     = await pdfDoc.getPage(n);
  const viewport = getViewport(page);

  // HIGH-DPI / RETINA FIX: Renders sharp text on modern screens
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width  = Math.floor(viewport.width) + 'px';
  canvas.style.height = Math.floor(viewport.height) + 'px';

  const ctx = canvas.getContext('2d');
  const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null;

  renderTask = page.render({ 
    canvasContext: ctx, 
    transform: transform, 
    viewport: viewport 
  });

  try {
    await renderTask.promise;
    canvas.classList.remove('loading-canvas');
  } catch(e) {
    if (e.name !== 'RenderingCancelledException') throw e;
  }

  document.getElementById('slide-page-info').textContent =
    `${n} / ${totalPages}`;
  document.getElementById('zoom-level').textContent =
    Math.round(zoomScale * 100) + '%';
  updateNavButtons();
}

function getViewport(page) {
  const baseVP = page.getViewport({ scale: 1 });

  if (autoZoom) {
    // FIT LOGIC: Calculate max available space avoiding UI bars
    const maxWidth = window.innerWidth - 60; 
    const maxHeight = window.innerHeight - 240; // Avoids topbar & bottom thumbnails
    
    const scaleW = maxWidth / baseVP.width;
    const scaleH = maxHeight / baseVP.height;
    
    // Pick the smaller scale so the entire slide fits perfectly on screen
    zoomScale = Math.min(scaleW, scaleH);
  }
  
  return page.getViewport({ scale: zoomScale });
}

function changePage(delta) {
  const n = currentPage + delta;
  if (n < 1 || n > totalPages) return;
  currentPage = n;
  renderPage(n);
  scrollThumbIntoView(n);
}

function changeZoom(delta) {
  autoZoom   = false;
  zoomScale  = Math.min(4, Math.max(0.25, zoomScale + delta));
  renderPage(currentPage);
}

function resetZoom() {
  autoZoom  = true;
  zoomScale = 1.0;
  renderPage(currentPage);
}

function updateNavButtons() {
  document.getElementById('prev-btn').disabled = currentPage <= 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;
}

function showPdfLoader(show) {
  document.getElementById('pdf-loader').classList.toggle('hidden', !show);
}

// Thumbnails
async function buildThumbnails() {
  const strip = document.getElementById('thumbnail-strip');
  strip.innerHTML = '';
  for (let i = 1; i <= Math.min(totalPages, 40); i++) {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (i === 1 ? ' active' : '');
    item.dataset.page = i;
    item.onclick = () => jumpToPage(i);

    const c = document.createElement('canvas');
    item.appendChild(c);

    const num = document.createElement('div');
    num.className = 'thumb-num';
    num.textContent = i;
    item.appendChild(num);

    strip.appendChild(item);

    (async (pageNum, canvas) => {
      const page = await pdfDoc.getPage(pageNum);
      const vp   = page.getViewport({ scale: 0.15 });
      canvas.width  = vp.width;
      canvas.height = vp.height;
      page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    })(i, c);
  }
}

function clearThumbnails() {
  document.getElementById('thumbnail-strip').innerHTML = '';
  document.getElementById('thumbnail-strip').classList.add('hidden');
  thumbnailsVisible = false;
}

function toggleThumbnails() {
  thumbnailsVisible = !thumbnailsVisible;
  document.getElementById('thumbnail-strip').classList.toggle('hidden', !thumbnailsVisible);
}

function jumpToPage(n) {
  currentPage = n;
  renderPage(n);
  scrollThumbIntoView(n);
}

function scrollThumbIntoView(n) {
  const strip = document.getElementById('thumbnail-strip');
  strip.querySelectorAll('.thumb-item').forEach(el => {
    const active = parseInt(el.dataset.page) === n;
    el.classList.toggle('active', active);
    if (active) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
}

// Fullscreen
function toggleFullscreen() {
  const viewer = document.getElementById('slide-viewer');
  viewer.classList.toggle('fullscreen');
  const btn = document.getElementById('fullscreen-btn');
  btn.textContent = viewer.classList.contains('fullscreen') ? '⊠' : '⛶';
}

// Download
function downloadCurrentFile() {
  if (!currentFile) return;
  const a = document.createElement('a');
  a.href = '/files/' + encodeURIComponent(currentFile.filename);
  a.download = currentFile.filename;
  a.click();
}

// =====================================================
//  CLOSE VIEWER (extended)
// =====================================================
function closeViewer() {
  ['slide-viewer','model-viewer-wrap','image-viewer','video-viewer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.getElementById('slide-viewer').classList.remove('fullscreen');
  document.getElementById('thumbnail-strip').classList.add('hidden');
  thumbnailsVisible = false;
  pdfDoc = null;
  currentPdf = null;
  const vid = document.getElementById('video-viewer-el');
  if (vid) { vid.pause(); vid.src = ''; }
  document.getElementById('browser').classList.remove('hidden');
}

// =====================================================
//  KEYBOARD NAVIGATION
// =====================================================
function handleGlobalKey(e) {
  const viewer = document.getElementById('slide-viewer');
  if (viewer.classList.contains('hidden')) return;

  switch(e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      e.preventDefault();
      changePage(1);
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault();
      changePage(-1);
      break;
    case 'Escape':
      if (viewer.classList.contains('fullscreen')) {
        toggleFullscreen();
      } else {
        closeViewer();
      }
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
    case '+':
    case '=':
      changeZoom(0.25);
      break;
    case '-':
      changeZoom(-0.25);
      break;
    case '0':
      resetZoom();
      break;
  }
}

// =====================================================
//  TOUCH SWIPE for PDF
// =====================================================
(function initSwipe() {
  let startX = 0;
  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const viewer = document.getElementById('slide-viewer');
    if (viewer.classList.contains('hidden')) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 60) changePage(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

// =====================================================
//  CONTACT QR
// =====================================================
function openContactQR(person) {
  const contacts = {
    shanmugaraj: {
      name: 'Shanmugaraj V.',
      role: 'Centre Head · Sci-F',
      qr:   'qr-shanmugaraj.png',
    },
    tom: {
      name: 'Tom Thampy',
      role: 'Group Head · Sci-E',
      qr:   'qr-tom.png',
    },
  };
  const c = contacts[person];
  if (!c) return;
  document.getElementById('qr-modal-name').textContent = c.name;
  document.getElementById('qr-modal-role').textContent = c.role;
  document.getElementById('qr-modal-img').src = c.qr;
  document.getElementById('qr-modal').classList.remove('hidden');
}

function closeContactQR() {
  document.getElementById('qr-modal').classList.add('hidden');
}

// =====================================================
//  TOAST SYSTEM
// =====================================================
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.remove(); }, 3100);
}

// =====================================================
//  IMAGE VIEWER (full-screen single image)
// =====================================================
function openImageViewer(f) {
  currentFile = f;
  document.getElementById('browser').classList.add('hidden');
  const wrap = document.getElementById('image-viewer');
  wrap.classList.remove('hidden');
  document.getElementById('image-viewer-title').textContent = f.title;
  document.getElementById('image-viewer-img').src = '/files/' + encodeURIComponent(f.filename);
  updateGalleryNav();
}

function updateGalleryNav() {
  const prev = document.getElementById('img-prev-btn');
  const next = document.getElementById('img-next-btn');
  const counter = document.getElementById('img-counter');
  if (prev) prev.disabled = galleryIndex <= 0;
  if (next) next.disabled = galleryIndex >= galleryFiles.length - 1;
  if (counter) counter.textContent = `${galleryIndex + 1} / ${galleryFiles.length}`;
}

function galleryNav(delta) {
  const n = galleryIndex + delta;
  if (n < 0 || n >= galleryFiles.length) return;
  galleryIndex = n;
  const f = galleryFiles[n];
  currentFile = f;
  if (f.mediaType === 'image') {
    document.getElementById('image-viewer-img').src = '/files/' + encodeURIComponent(f.filename);
    document.getElementById('image-viewer-title').textContent = f.title;
    document.getElementById('image-viewer').classList.remove('hidden');
    document.getElementById('video-viewer').classList.add('hidden');
  } else {
    openVideoViewer(f);
    document.getElementById('image-viewer').classList.add('hidden');
  }
  updateGalleryNav();
}

// =====================================================
//  VIDEO VIEWER
// =====================================================
function openVideoViewer(f) {
  currentFile = f;
  document.getElementById('browser').classList.add('hidden');
  const wrap = document.getElementById('video-viewer');
  wrap.classList.remove('hidden');
  document.getElementById('video-viewer-title').textContent = f.title;
  const vid = document.getElementById('video-viewer-el');
  vid.src = '/files/' + encodeURIComponent(f.filename);
  vid.play().catch(() => {});
}

// =====================================================
//  LIGHTBOX (gallery mode)
// =====================================================
function openLightbox(f, idx) {
  galleryIndex = idx;
  const lb = document.getElementById('gallery-lightbox');
  lb.classList.remove('hidden');
  loadLightboxItem(f);
}

function loadLightboxItem(f) {
  const img   = document.getElementById('lightbox-img');
  const vid   = document.getElementById('lightbox-video');
  const cap   = document.getElementById('lightbox-caption');

  if (f.mediaType === 'video') {
    img.style.display = 'none';
    vid.style.display = 'block';
    vid.src = '/files/' + encodeURIComponent(f.filename);
    vid.play().catch(() => {});
  } else {
    vid.pause(); vid.src = '';
    vid.style.display = 'none';
    img.style.display = 'block';
    img.src = '/files/' + encodeURIComponent(f.filename);
  }
  cap.textContent = f.title + (galleryFiles.length > 1 ? `  [${galleryIndex + 1} / ${galleryFiles.length}]` : '');
}

function lightboxNav(delta) {
  const n = galleryIndex + delta;
  if (n < 0 || n >= galleryFiles.length) return;
  galleryIndex = n;
  loadLightboxItem(galleryFiles[n]);
}

function closeLightbox() {
  const lb = document.getElementById('gallery-lightbox');
  lb.classList.add('hidden');
  const vid = document.getElementById('lightbox-video');
  vid.pause(); vid.src = '';
}

// =====================================================
//  ATTRACT LOOP
// =====================================================
function startAttractLoop() {
  if (attractFiles.length === 0) return;
  attractActive = true;
  attractIndex  = 0;
  const el = document.getElementById('attract-loop');
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('visible'));
  buildAttractDots();
  showAttractSlide(attractIndex);
  attractTimer = setInterval(() => {
    attractIndex = (attractIndex + 1) % attractFiles.length;
    showAttractDots();
    showAttractSlide(attractIndex);
  }, ATTRACT_INTERVAL);
}

function stopAttractLoop() {
  attractActive = false;
  clearInterval(attractTimer);
  const el = document.getElementById('attract-loop');
  el.classList.remove('visible');
  setTimeout(() => el.classList.add('hidden'), 600);
  // Stop any attract video
  const av = document.getElementById('attract-video');
  if (av) { av.pause(); av.src = ''; }
}

function showAttractSlide(idx) {
  if (!attractFiles.length) return;
  const f   = attractFiles[idx];
  const img = document.getElementById('attract-img');
  const vid = document.getElementById('attract-video');
  const titleEl = document.getElementById('attract-title');
  if (titleEl) titleEl.textContent = f.title;

  if (f.mediaType === 'video') {
    img.style.display = 'none';
    vid.style.display = 'block';
    vid.src = '/files/' + encodeURIComponent(f.filename);
    vid.play().catch(() => {});
  } else {
    vid.pause(); vid.src = '';
    vid.style.display = 'none';
    img.style.display = 'block';
    // Crossfade
    img.style.opacity = '0';
    img.onload = () => { img.style.opacity = '1'; };
    img.src = '/files/' + encodeURIComponent(f.filename);
  }
}

function buildAttractDots() {
  const dotsEl = document.getElementById('attract-dots');
  if (!dotsEl || !attractFiles.length) return;
  dotsEl.innerHTML = attractFiles.map((_, i) =>
    `<span class="attract-dot${i === 0 ? ' active' : ''}"></span>`
  ).join('');
}

function showAttractDots() {
  const dotsEl = document.getElementById('attract-dots');
  if (!dotsEl) return;
  dotsEl.querySelectorAll('.attract-dot').forEach((d, i) => {
    d.classList.toggle('active', i === attractIndex);
  });
}

// =====================================================
//  ABOUT — PHOTO CAROUSEL
// =====================================================
let carouselFiles  = [];
let carouselIdx    = 0;
let carouselAutoTimer = null;

function initCarousel() {
  // Use gallery images (not videos) for the carousel
  carouselFiles = allFiles.filter(f => f.mediaType === 'image');
  const track = document.getElementById('carousel-track');
  const dots  = document.getElementById('carousel-dots');
  if (!track) return;

  if (carouselFiles.length === 0) {
    // Keep placeholder
    track.innerHTML = `
      <div class="carousel-slide placeholder-slide">
        <div class="carousel-placeholder">
          <span>📸</span>
          <span>Upload photos to the Gallery category<br>to show here</span>
        </div>
      </div>`;
    if (dots) dots.innerHTML = '';
    document.getElementById('carousel-prev').style.display = 'none';
    document.getElementById('carousel-next').style.display = 'none';
    return;
  }

  document.getElementById('carousel-prev').style.display = '';
  document.getElementById('carousel-next').style.display = '';

  track.innerHTML = carouselFiles.map((f, i) => `
    <div class="carousel-slide" data-idx="${i}">
      <img src="/files/${encodeURIComponent(f.filename)}" alt="${escapeHtml(f.title)}" loading="lazy">
      <div class="carousel-caption">${escapeHtml(f.title)}</div>
    </div>
  `).join('');

  if (dots) {
    dots.innerHTML = carouselFiles.map((_, i) =>
      `<span class="carousel-dot${i === 0 ? ' active' : ''}" onclick="jumpCarousel(${i})"></span>`
    ).join('');
  }

  carouselIdx = 0;
  positionCarousel(0);
  startCarouselAuto();
}

function positionCarousel(idx) {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  track.style.transform = `translateX(-${idx * 100}%)`;
  document.querySelectorAll('.carousel-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });
  const prev = document.getElementById('carousel-prev');
  const next = document.getElementById('carousel-next');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx >= carouselFiles.length - 1;
}

function carouselNav(delta) {
  const n = carouselIdx + delta;
  if (n < 0 || n >= carouselFiles.length) return;
  carouselIdx = n;
  positionCarousel(n);
  restartCarouselAuto();
}

function jumpCarousel(idx) {
  carouselIdx = idx;
  positionCarousel(idx);
  restartCarouselAuto();
}

function startCarouselAuto() {
  clearInterval(carouselAutoTimer);
  if (carouselFiles.length < 2) return;
  carouselAutoTimer = setInterval(() => {
    carouselIdx = (carouselIdx + 1) % carouselFiles.length;
    positionCarousel(carouselIdx);
  }, 5000);
}

function restartCarouselAuto() {
  clearInterval(carouselAutoTimer);
  startCarouselAuto();
}

// Touch swipe on carousel
(function initCarouselSwipe() {
  let sx = 0;
  document.addEventListener('touchstart', e => {
    const ab = document.getElementById('about');
    if (!ab || ab.classList.contains('hidden')) return;
    sx = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const ab = document.getElementById('about');
    if (!ab || ab.classList.contains('hidden')) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) carouselNav(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

// =====================================================
//  ENQUIRY FORM
// =====================================================
let selectedInterest = '';
let successCountdownTimer = null;

function selectInterest(btn) {
  document.querySelectorAll('.interest-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedInterest = btn.dataset.val;
}

async function loadEnquiryCount() {
  try {
    const res = await fetch('/api/enquiries/count');
    const data = await res.json();
    const note = document.getElementById('enq-footer-note');
    if (note && data.count > 0) {
      note.textContent = `${data.count} enquir${data.count === 1 ? 'y' : 'ies'} recorded at this kiosk`;
    }
  } catch(e) {}
}

function clearEnquiry() {
  document.getElementById('enq-name').value    = '';
  document.getElementById('enq-org').value     = '';
  document.getElementById('enq-email').value   = '';
  document.getElementById('enq-message').value = '';
  selectedInterest = '';
  document.querySelectorAll('.interest-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('enq-status').textContent = '';
}

async function submitEnquiry() {
  const name    = document.getElementById('enq-name').value.trim();
  const org     = document.getElementById('enq-org').value.trim();
  const email   = document.getElementById('enq-email').value.trim();
  const message = document.getElementById('enq-message').value.trim();
  const status  = document.getElementById('enq-status');
  const btn     = document.getElementById('enq-submit-btn');

  if (!name)             { setEnqStatus('Please enter your name.', 'err'); return; }
  if (!org)              { setEnqStatus('Please enter your organisation.', 'err'); return; }
  if (!selectedInterest) { setEnqStatus('Please select an area of interest.', 'err'); return; }

  btn.disabled = true;
  setEnqStatus('Submitting...', 'working');

  try {
    const res = await fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, organisation: org, email, interest: selectedInterest, message }),
    });
    const data = await res.json();
    if (data.success) {
      showEnquirySuccess(name);
    } else {
      setEnqStatus('✗ ' + (data.error || 'Submission failed'), 'err');
    }
  } catch(e) {
    setEnqStatus('✗ Could not reach server', 'err');
  }
  btn.disabled = false;
}

function setEnqStatus(msg, type) {
  const el = document.getElementById('enq-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'enq-status ' + (type === 'err' ? 'enq-err' : type === 'working' ? 'enq-working' : 'enq-ok');
}

// =====================================================
//  ENQUIRY SUCCESS
// =====================================================
function showEnquirySuccess(name) {
  clearEnquiry();
  hideAllScreens();
  document.getElementById('enquiry-success').classList.remove('hidden');
  document.getElementById('success-name').textContent = name;

  let n = 8;
  document.getElementById('success-countdown').textContent = n;
  stopSuccessCountdown();
  successCountdownTimer = setInterval(() => {
    n--;
    const el = document.getElementById('success-countdown');
    if (el) el.textContent = n;
    if (n <= 0) { stopSuccessCountdown(); goHome(); }
  }, 1000);
}

function stopSuccessCountdown() {
  clearInterval(successCountdownTimer);
  successCountdownTimer = null;
}