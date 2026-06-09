const express  = require('express');
const multer   = require('multer');
const chokidar = require('chokidar');
const path     = require('path');
const fs       = require('fs');
const { execFile } = require('child_process');

const app      = express();
const PORT     = 3000;
const FILES_DIR    = '/home/pi/kiosk/files';
const USB_DIR      = '/media/root';
const META_FILE    = '/home/pi/kiosk/metadata.json';
const ENQUIRY_FILE = '/home/pi/kiosk/enquiries.json';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(FILES_DIR));

// ─── Metadata helpers ───────────────────────────────
function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {}
  return {};
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ─── Enquiry helpers ─────────────────────────────────
function loadEnquiries() {
  try {
    if (fs.existsSync(ENQUIRY_FILE)) return JSON.parse(fs.readFileSync(ENQUIRY_FILE, 'utf8'));
  } catch (e) {}
  return [];
}

function saveEnquiry(entry) {
  const list = loadEnquiries();
  list.push(entry);
  fs.writeFileSync(ENQUIRY_FILE, JSON.stringify(list, null, 2));
}

// ─── Multer ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FILES_DIR),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.pptx','.ppt','.glb','.gltf','.obj','.stl',
                     '.jpg','.jpeg','.png','.webp','.gif','.mp4','.webm','.mov'];
    const ok = allowed.includes(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  }
});

// ─── Conversion queue with SSE broadcast ────────────
const conversionQueue = [];
let converting = false;

// SSE clients set
const sseClients = new Set();

function broadcastQueue() {
  const payload = JSON.stringify({
    status: converting || conversionQueue.length > 0 ? 'busy' : 'idle',
    queue:  conversionQueue.length,
  });
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

function enqueueConversion(filePath, callback) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pptx' && ext !== '.ppt') {
    if (callback) callback(filePath);
    return;
  }
  conversionQueue.push({ filePath, callback });
  broadcastQueue();
  processQueue();
}

function processQueue() {
  if (converting || conversionQueue.length === 0) return;
  converting = true;
  broadcastQueue();

  const { filePath, callback } = conversionQueue.shift();
  console.log(`Converting: ${filePath}`);

  execFile('libreoffice', [
    '--headless', '--convert-to', 'pdf', '--outdir', FILES_DIR, filePath,
  ], (err) => {
    converting = false;

    if (err) {
      console.error('Conversion failed:', err);
      broadcastQueue();
      processQueue();
      return;
    }

    const pdfName = path.basename(filePath, path.extname(filePath)) + '.pdf';
    const pdfPath = path.join(FILES_DIR, pdfName);
    fs.unlink(filePath, () => {});
    console.log('Converted:', pdfName);

    if (callback) callback(pdfPath);
    broadcastQueue();
    processQueue();
  });
}

// ─── File watcher (FILES_DIR + USB) ─────────────────
function watchDir(dir, createIfMissing = true) {
  if (!fs.existsSync(dir)) {
    if (!createIfMissing) { console.log(`Skipping watch: ${dir}`); return; }
    fs.mkdirSync(dir, { recursive: true });
  }
  chokidar.watch(dir, { ignoreInitial: false, depth: 2 }).on('add', filePath => {
    console.log('File detected:', filePath);
    enqueueConversion(filePath, (finalPath) => {
      const meta = loadMeta();
      const filename = path.basename(finalPath);
      if (!meta[filename]) {
        const cleaned = filename
          .replace(/^\d+-/, '')
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        meta[filename] = {
          title:    cleaned,
          category: 'General',
          uploaded: new Date().toISOString(),
        };
        saveMeta(meta);
      }
    });
  });
}

watchDir(FILES_DIR);
watchDir(USB_DIR, false);

// ─── API: list files ─────────────────────────────────
const SUPPORTED = ['.pdf', '.glb', '.gltf', '.obj', '.stl',
                   '.jpg', '.jpeg', '.png', '.webp', '.gif',
                   '.mp4', '.webm', '.mov'];

app.get('/api/files', (req, res) => {
  fs.readdir(FILES_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot read files dir' });
    const meta = loadMeta();
    const imageExts = ['jpg','jpeg','png','webp','gif'];
    const videoExts = ['mp4','webm','mov'];
    const result = files
      .filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
      .map(f => {
        const ext = path.extname(f).slice(1).toLowerCase();
        let mediaType = 'document';
        if (imageExts.includes(ext)) mediaType = 'image';
        else if (videoExts.includes(ext)) mediaType = 'video';
        else if (['glb','gltf','obj','stl'].includes(ext)) mediaType = '3d';
        return {
          filename: f,
          title:    meta[f]?.title    || f.replace(/^\d+-/, '').replace(/\.[^.]+$/, ''),
          category: meta[f]?.category || 'General',
          uploaded: meta[f]?.uploaded || null,
          ext,
          mediaType,
        };
      })
      .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''));
    res.json(result);
  });
});

// ─── API: upload ─────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const title    = req.body.title    || req.file.originalname.replace(/\.[^.]+$/, '');
  const category = req.body.category || 'General';

  enqueueConversion(req.file.path, (finalPath) => {
    const filename = path.basename(finalPath);
    const meta = loadMeta();
    meta[filename] = { title, category, uploaded: new Date().toISOString() };
    saveMeta(meta);
  });

  res.json({ success: true });
});

// ─── API: delete ─────────────────────────────────────
app.delete('/api/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(FILES_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    const meta = loadMeta();
    delete meta[filename];
    saveMeta(meta);
    res.json({ success: true });
  });
});

// ─── API: update metadata ────────────────────────────
app.patch('/api/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const meta = loadMeta();
  if (!meta[filename]) meta[filename] = {};
  if (req.body.title)    meta[filename].title    = req.body.title;
  if (req.body.category) meta[filename].category = req.body.category;
  saveMeta(meta);
  res.json({ success: true });
});

// ─── SSE: queue status ───────────────────────────────
app.get('/api/queue-status', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // disable Nginx buffering if proxied
  res.flushHeaders();

  // Send initial state
  const payload = JSON.stringify({
    status: converting ? 'busy' : 'idle',
    queue:  conversionQueue.length,
  });
  res.write(`data: ${payload}\n\n`);

  sseClients.add(res);

  // Keepalive ping every 20 s
  const keepalive = setInterval(() => res.write(': ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(res);
  });
});

// ─── Download with proper headers ────────────────────
// (express.static already handles this, but this gives a forced-download variant)
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(FILES_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.download(filePath, filename);
});

// ─── API: submit enquiry ─────────────────────────────
app.post('/api/enquiry', (req, res) => {
  const { name, organisation, email, interest, message } = req.body;
  if (!name || !organisation || !interest) {
    return res.status(400).json({ error: 'Name, organisation and interest are required' });
  }
  const entry = {
    id:           Date.now(),
    timestamp:    new Date().toISOString(),
    name:         String(name).slice(0, 120),
    organisation: String(organisation).slice(0, 120),
    email:        String(email || '').slice(0, 120),
    interest:     String(interest).slice(0, 80),
    message:      String(message || '').slice(0, 1000),
  };
  saveEnquiry(entry);
  console.log('Enquiry saved:', entry.name, entry.organisation);
  res.json({ success: true, id: entry.id });
});

// ─── API: list enquiries (admin) ─────────────────────
app.get('/api/enquiries', (req, res) => {
  res.json(loadEnquiries());
});

// ─── API: enquiry count ──────────────────────────────
app.get('/api/enquiries/count', (req, res) => {
  res.json({ count: loadEnquiries().length });
});

// ─── Start ───────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kiosk backend running on http://0.0.0.0:${PORT}`);
});