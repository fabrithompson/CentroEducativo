import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Un único pool de conexiones reutilizado por toda la app.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

// Helper para ejecutar queries con parámetros (previene inyección SQL).
export const query = (text, params) => pool.query(text, params);
