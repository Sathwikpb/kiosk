// --- State ---
let pdfDoc = null;
let currentPage = 1;
const INACTIVITY_MS = 1*10 * 1000;
let sleepTimer = null;
let isSleeping = false;
let selectMode = false;
let selectedFiles = new Set();

// --- Splash ---
async function waitForBackend() {
  const status = document.getElementById('splash-status');
  while (true) {
    try {
      const res = await fetch('/api/files');
      if (res.ok) break;
    } catch (e) {}
    status.textContent = 'Connecting to backend...';
    await new Promise(r => setTimeout(r, 800));
  }
  status.textContent = 'Ready';
  await new Promise(r => setTimeout(r, 600));
  dismissSplash();
}


function dismissSplash() {
  const splash = document.getElementById('splash');
  splash.classList.add('fade-out');
  setTimeout(() => {
    splash.style.display = 'none';
    
    // CHANGE THIS LINE to show 'home' instead of 'browser'
    document.getElementById('home').classList.remove('hidden'); 
    
    startInactivityTimer();
  }, 800);
}

function dismissSplash() {
  const splash = document.getElementById('splash');
  splash.classList.add('fade-out');
  setTimeout(() => {
    splash.style.display = 'none';
    
    
    document.getElementById('home').classList.remove('hidden'); 
    
    startInactivityTimer();
  }, 800);
}

// --- Inactivity / Sleep ---
function startInactivityTimer() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(goToSleep, INACTIVITY_MS);
}

function resetInactivityTimer() {
  if (isSleeping) return;
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(goToSleep, INACTIVITY_MS);
}

function goToSleep() {
  isSleeping = true;
  const sleep = document.getElementById('sleep');
  sleep.classList.remove('hidden');
  requestAnimationFrame(() => sleep.classList.add('fade-in'));
}

function wakeUp() {
  if (!isSleeping) return;
  isSleeping = false;
  const sleep = document.getElementById('sleep');
  sleep.classList.add('hidden');
  sleep.classList.remove('fade-in');
  startInactivityTimer();
}

['touchstart', 'touchend', 'mousedown', 'mousemove', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (isSleeping) wakeUp();
    else resetInactivityTimer();
  }, { passive: true });
});

// --- File Browser ---
function iconFor(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['glb', 'gltf', 'obj', 'stl'].includes(ext)) return '🧊';
  return '📁';
}

// --- Home Screen Navigation ---
// --- Home Screen Navigation ---
function showBrowser() {
  document.getElementById('home').classList.add('hidden');
  document.getElementById('browser').classList.remove('hidden');
  
  // Load files when "Present" is clicked
  if (typeof loadFiles === 'function') {
    loadFiles();
  }
}

function goHome() {
  // Hide the browser and any open viewers
  document.getElementById('browser').classList.add('hidden');
  document.getElementById('slide-viewer').classList.add('hidden');
  document.getElementById('model-viewer-wrap').classList.add('hidden');
  
  // Show the Home Screen
  document.getElementById('home').classList.remove('hidden');
}
async function loadFiles() {
  const grid = document.getElementById('file-grid');
  grid.innerHTML = '<p style="color:#666;padding:20px">Loading...</p>';
  const res = await fetch('/api/files');
  const files = await res.json();
  if (files.length === 0) {
    grid.innerHTML = '<p style="color:#666;padding:20px">No files yet. Upload or plug in a USB drive.</p>';
    return;
  }
  grid.innerHTML = files.map(f => `
    <div class="file-card ${selectedFiles.has(f) ? 'selected' : ''}"
         id="card-${CSS.escape(f)}"
         onclick="handleCardClick('${f}')">
      <div class="file-icon">${iconFor(f)}</div>
      <div class="file-name">${f}</div>
      <div class="select-indicator">✓</div>
    </div>
  `).join('');
}

function handleCardClick(filename) {
  if (selectMode) {
    toggleSelect(filename);
  } else {
    openFile(filename);
  }
}

// --- Select Mode ---
function toggleSelectMode() {
  selectMode = true;
  selectedFiles.clear();
  document.getElementById('delete-btn').classList.add('hidden');
  document.getElementById('confirm-delete-btn').classList.remove('hidden');
  document.getElementById('cancel-select-btn').classList.remove('hidden');
  document.getElementById('upload-btn').classList.add('hidden');
  document.getElementById('refresh-btn').classList.add('hidden');
  updateSelectedCount();
  document.querySelectorAll('.file-card').forEach(c => c.classList.add('selectable'));
}

function cancelSelectMode() {
  selectMode = false;
  selectedFiles.clear();
  document.getElementById('delete-btn').classList.remove('hidden');
  document.getElementById('confirm-delete-btn').classList.add('hidden');
  document.getElementById('cancel-select-btn').classList.add('hidden');
  document.getElementById('upload-btn').classList.remove('hidden');
  document.getElementById('refresh-btn').classList.remove('hidden');
  document.querySelectorAll('.file-card').forEach(c => {
    c.classList.remove('selectable', 'selected');
  });
}

function toggleSelect(filename) {
  if (selectedFiles.has(filename)) {
    selectedFiles.delete(filename);
    document.getElementById('card-' + CSS.escape(filename))?.classList.remove('selected');
  } else {
    selectedFiles.add(filename);
    document.getElementById('card-' + CSS.escape(filename))?.classList.add('selected');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('selected-count').textContent = selectedFiles.size;
}

async function confirmDelete() {
  if (selectedFiles.size === 0) { cancelSelectMode(); return; }
  const names = [...selectedFiles].join(', ');
  if (!confirm(`Delete ${selectedFiles.size} file(s)?\n\n${names}`)) return;
  for (const filename of selectedFiles) {
    await fetch('/api/files/' + encodeURIComponent(filename), { method: 'DELETE' });
  }
  cancelSelectMode();
  loadFiles();
}

// --- Viewers ---
function openFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') openPdf(filename);
  else if (['glb', 'gltf', 'obj', 'stl'].includes(ext)) openModel(filename);
}

async function openPdf(filename) {
  document.getElementById('browser').classList.add('hidden');
  document.getElementById('slide-viewer').classList.remove('hidden');
  document.getElementById('slide-filename').textContent = filename;
  const pdfjsLib = await import('https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
  pdfDoc = await pdfjsLib.getDocument('/files/' + filename).promise;
  currentPage = 1;
  renderPage(currentPage);
}

async function renderPage(num) {
  const page = await pdfDoc.getPage(num);
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  const viewport = page.getViewport({ scale: window.innerWidth / page.getViewport({ scale: 1 }).width });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  document.getElementById('slide-page-info').textContent = `${num} / ${pdfDoc.numPages}`;
}

function changePage(delta) {
  const next = currentPage + delta;
  if (next < 1 || next > pdfDoc.numPages) return;
  currentPage = next;
  renderPage(currentPage);
}

function openModel(filename) {
  document.getElementById('browser').classList.add('hidden');
  document.getElementById('model-viewer-wrap').classList.remove('hidden');
  document.getElementById('model-filename').textContent = filename;
  document.getElementById('mv').src = '/files/' + filename;
}

function closeViewer() {
  document.getElementById('slide-viewer').classList.add('hidden');
  document.getElementById('model-viewer-wrap').classList.add('hidden');
  document.getElementById('browser').classList.remove('hidden');
  pdfDoc = null;
}

// --- Boot ---
waitForBackend();
