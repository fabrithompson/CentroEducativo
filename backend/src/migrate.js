import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

// Ejecuta el archivo db/schema.sql contra la base configurada en DATABASE_URL.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

async function migrar() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('✓ Migración aplicada: tablas creadas correctamente.');
  } catch (err) {
    console.error('✗ Error al migrar:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrar();
