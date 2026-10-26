/**
 * RF-03 — Los padres sólo ven y gestionan la información de sus propios hijos.
 *
 * Prueba de regresión end-to-end: un navegador real entra al portal, abre el
 * modal de ingreso, escribe usuario y contraseña, y verifica lo que el tutor
 * ve en su panel. Es la regla de seguridad más sensible del sistema —datos de
 * menores—, y la que más fácil se rompe sin que ninguna prueba unitaria lo
 * note: alcanza con que una consulta nueva olvide filtrar por tutor.
 *
 * Datos: los del seed (`prisma/seed.ts`), contraseña `123456`.
 *   - Patricia Medina (`pmedina`) es madre de Mateo Medina.
 *   - Mariana Gómez (`mgomezp`) es madre de María Paz Gómez e Ignacio Flores.
 *
 * Se corre con `pnpm --filter backend test:e2e`, que levanta la pila completa
 * y define `E2E_URL`.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import edge from 'selenium-webdriver/edge.js';

const URL_BASE = process.env.E2E_URL ?? 'http://127.0.0.1:4599';
const NAVEGADOR = process.env.E2E_NAVEGADOR ?? (process.platform === 'win32' ? 'MicrosoftEdge' : 'chrome');
const ESPERA = 15_000;

let driver: WebDriver;

// Ventana de escritorio: por debajo de cierto ancho la barra de navegación se
// colapsa en el menú hamburguesa y el enlace «Iniciar sesión» no es clickeable.
function nuevoNavegador(): Promise<WebDriver> {
  const args = ['--headless=new', '--window-size=1280,900', '--no-sandbox', '--disable-dev-shm-usage'];
  return new Builder()
    .forBrowser(NAVEGADOR)
    .setChromeOptions(new chrome.Options().addArguments(...args))
    .setEdgeOptions(new edge.Options().addArguments(...args))
    .build();
}

beforeEach(async () => {
  driver = await nuevoNavegador();
});

afterEach(async () => {
  await driver?.quit();
});

/** Los mismos pasos que hace una persona: portal → «Iniciar sesión» → datos → «Ingresar al Campus». */
async function ingresar(usuario: string, password: string) {
  await driver.get(`${URL_BASE}/`);
  await driver.findElement(By.css('#loginLink a')).click();
  const campoUsuario = await driver.wait(until.elementLocated(By.id('username')), ESPERA);
  await driver.wait(until.elementIsVisible(campoUsuario), ESPERA);
  await campoUsuario.sendKeys(usuario);
  await driver.findElement(By.id('password')).sendKeys(password);
  await driver.findElement(By.css('#loginForm button[type="submit"]')).click();
}

/**
 * Espera a que el selector «Alumno a cargo» termine de cargar y devuelve el
 * texto de sus opciones. Se lee todo de una vez desde la página: el panel
 * reescribe el `innerHTML` del selector al cargar, y una referencia a una
 * opción tomada un instante antes queda inválida.
 */
async function hijosEnElSelector(): Promise<string[]> {
  await driver.wait(until.urlContains('panel_padre.html'), ESPERA);
  return driver.wait(
    () =>
      driver.executeScript<string[] | null>(() => {
        const opciones = [...document.querySelectorAll<HTMLOptionElement>('#selectHijo option')];
        if (opciones.length === 0 || opciones[0].value === '') return null;
        return opciones.map((o) => o.textContent?.trim() ?? '');
      }),
    ESPERA,
  ) as Promise<string[]>;
}

/** Pide a la API, con la sesión del navegador, los ids de alumno de los hijos del tutor. */
async function idsDeMisHijos(): Promise<number[]> {
  return driver.executeAsyncScript<number[]>(`
    const listo = arguments[arguments.length - 1];
    fetch('/api/padres/mis-hijos', { headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') } })
      .then((r) => r.json())
      .then((d) => listo(d.hijos.map((h) => h.alumno.id)));
  `);
}

describe('RF-03 · un padre sólo ve a sus propios hijos', () => {
  test('una madre con dos hijos ve exactamente a esos dos', async () => {
    await ingresar('mgomezp', '123456');
    const hijos = await hijosEnElSelector();

    assert.equal(hijos.length, 2, `esperaba 2 hijos y el selector muestra: ${hijos.join(' | ')}`);
    assert.ok(hijos.some((h) => h.startsWith('Gómez, María Paz')), `falta María Paz Gómez en: ${hijos.join(' | ')}`);
    assert.ok(hijos.some((h) => h.startsWith('Flores, Ignacio Tomás')), `falta Ignacio Flores en: ${hijos.join(' | ')}`);
  });

  test('una madre con un hijo ve sólo a ese hijo', async () => {
    await ingresar('pmedina', '123456');
    const hijos = await hijosEnElSelector();

    assert.equal(hijos.length, 1, `esperaba 1 hijo y el selector muestra: ${hijos.join(' | ')}`);
    assert.ok(hijos[0].startsWith('Medina, Mateo'), `esperaba a Mateo Medina y aparece: ${hijos[0]}`);
  });

  test('no puede pedir los datos de un alumno que no es su hijo, aunque conozca el id', async () => {
    // Primero se averigua el id de Mateo con la sesión de su madre…
    await ingresar('pmedina', '123456');
    await hijosEnElSelector();
    const [idDeMateo] = await idsDeMisHijos();
    assert.ok(idDeMateo, 'no se pudo obtener el id de Mateo');

    await driver.quit();
    driver = await nuevoNavegador();

    // …y después lo pide otra madre, escribiendo la URL de la API a mano.
    await ingresar('mgomezp', '123456');
    await hijosEnElSelector();
    const estado = await driver.executeAsyncScript<number>(`
      const listo = arguments[arguments.length - 1];
      fetch('/api/padres/mis-hijos/${idDeMateo}/deportes', {
        headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') },
      }).then((r) => listo(r.status));
    `);

    // 404 y no 403 a propósito: el portal no confirma que ese alumno exista.
    assert.equal(estado, 404, `un tutor ajeno obtuvo ${estado} al pedir los deportes de Mateo`);
  });
});
