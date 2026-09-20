// Espera a que el servidor de base de datos acepte conexiones antes de migrar.
//
// Por qué existe: el `preDeployCommand` de Railway corre `prisma migrate
// deploy`, y si el servicio de PostgreSQL está reiniciando, Prisma corta con
// P1001 y el despliegue queda en Crashed hasta que alguien lo redespliega a
// mano. Pasó el 20/09/2026 durante una restauración: el backend quedó caído
// detrás de una base que volvió sola un minuto más tarde.
//
// Está en JavaScript y no en TypeScript a propósito: corre con `node` pelado,
// sin `tsx` y sin el cliente de Prisma, que es lo único garantizado en el
// contenedor antes de que arranque nada.
//
// Alcance: verifica que el puerto acepte una conexión TCP, que es exactamente
// lo que falla cuando el servicio está caído (el nombre `.railway.internal` ni
// siquiera resuelve). No verifica que PostgreSQL haya terminado su
// recuperación interna; para ese caso hay dos segundos de gracia al final.

import net from 'node:net';

const ESPERA_MAXIMA_MS = 120_000;
const INTERVALO_MS = 3_000;
const TIMEOUT_CONEXION_MS = 5_000;
const GRACIA_MS = 2_000;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[esperar-db] falta DATABASE_URL.');
  process.exit(1);
}

let host;
let puerto;
try {
  const parsed = new URL(url);
  host = parsed.hostname;
  puerto = Number(parsed.port) || 5432;
} catch {
  console.error('[esperar-db] DATABASE_URL no es una URL válida.');
  process.exit(1);
}

/** Un intento de conexión. Resuelve en true si el puerto contesta. */
function intentar() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resuelto = false;
    const cerrar = (ok) => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(TIMEOUT_CONEXION_MS);
    socket.once('connect', () => cerrar(true));
    socket.once('timeout', () => cerrar(false));
    socket.once('error', () => cerrar(false));
    socket.connect(puerto, host);
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const limite = Date.now() + ESPERA_MAXIMA_MS;
let intento = 0;

while (Date.now() < limite) {
  intento += 1;
  if (await intentar()) {
    console.log(`[esperar-db] ${host}:${puerto} responde (intento ${intento}).`);
    await dormir(GRACIA_MS);
    process.exit(0);
  }
  console.log(
    `[esperar-db] ${host}:${puerto} no responde (intento ${intento}); ` +
      `se reintenta en ${INTERVALO_MS / 1000}s.`,
  );
  await dormir(INTERVALO_MS);
}

// Agotado el plazo se aborta en vez de migrar: si la base no volvió en dos
// minutos, el problema no es un parpadeo y conviene que el despliegue falle
// ruidosamente.
console.error(
  `[esperar-db] la base no respondió en ${ESPERA_MAXIMA_MS / 1000}s. ` +
    'Se aborta antes de migrar.',
);
process.exit(1);
