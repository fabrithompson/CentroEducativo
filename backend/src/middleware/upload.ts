import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { env } from '../config/env';

const uploadsAbs = path.resolve(process.cwd(), env.UPLOAD_DIR);
if (!fs.existsSync(uploadsAbs)) {
  fs.mkdirSync(uploadsAbs, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsAbs),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const safe = file.originalname
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .slice(0, 80);
    cb(null, `${ts}-${rnd}-${safe}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

/** Devuelve la URL pública servida por Express para un archivo guardado. */
export function publicUrlFor(filename: string): string {
  return `/uploads/${filename}`;
}
