import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', '..', 'uploads');

// Aseguramos que la carpeta uploads exista.
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // Nombre único: timestamp + nombre original saneado.
    const limpio = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${limpio}`);
  },
});

// Solo aceptamos PDF (validación de tipo de archivo).
function fileFilter(_req, file, cb) {
  const esPdf =
    file.mimetype === 'application/pdf' &&
    path.extname(file.originalname).toLowerCase() === '.pdf';
  if (esPdf) cb(null, true);
  else cb(new Error('El CV debe ser un archivo PDF.'));
}

export const subirCV = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máx.
}).single('cv');
