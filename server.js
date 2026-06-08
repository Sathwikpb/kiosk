const express = require('express');
const multer = require('multer');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
const PORT = 3000;
const FILES_DIR = '/home/pi/kiosk/files';
const USB_DIR = '/media/root';

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(FILES_DIR));

// --- Multer upload config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FILES_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// --- PPTX to PDF conversion ---
function convertToPdf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pptx' && ext !== '.ppt') return;
  console.log(`Converting: ${filePath}`);
  execFile('libreoffice', [
    '--headless', '--convert-to', 'pdf', '--outdir', FILES_DIR, filePath
  ], (err, stdout, stderr) => {
    if (err) { console.error('Conversion failed:', err); return; }
    console.log('Converted to PDF:', stdout);
    fs.unlink(filePath, () => {});
  });
}

// --- File watcher ---
function watchDir(dir, createIfMissing = true) {
  if (!fs.existsSync(dir)) {
    if (!createIfMissing) {
      console.log(`Skipping watch, dir not present: ${dir}`);
      return;
    }
    fs.mkdirSync(dir, { recursive: true });
  }
  chokidar.watch(dir, { ignoreInitial: false, depth: 2 }).on('add', filePath => {
    console.log('File detected:', filePath);
    convertToPdf(filePath);
  });
}

watchDir(FILES_DIR);
watchDir(USB_DIR, false);

// --- API: list files ---
app.get('/api/files', (req, res) => {
  const supported = ['.pdf', '.glb', '.gltf', '.obj', '.stl'];
  fs.readdir(FILES_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot read files dir' });
    const filtered = files.filter(f => supported.includes(path.extname(f).toLowerCase()));
    res.json(filtered);
  });
});

// --- API: upload ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  convertToPdf(req.file.path);
  res.json({ success: true, filename: req.file.filename });
});

// --- API: delete ---
app.delete('/api/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(FILES_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ success: true });
  });
});


// --- Start ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kiosk backend running on http://0.0.0.0:${PORT}`);
});
