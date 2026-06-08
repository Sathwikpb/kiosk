let pdfDoc = null;
let currentPage = 1;

function iconFor(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['glb', 'gltf', 'obj', 'stl'].includes(ext)) return '🧊';
  return '📁';
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
    <div class="file-card" onclick="openFile('${f}')">
      <div class="file-icon">${iconFor(f)}</div>
      <div class="file-name">${f}</div>
    </div>
  `).join('');
}

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

loadFiles();
