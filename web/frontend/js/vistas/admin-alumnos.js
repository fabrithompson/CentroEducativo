/**
 * ABM de alumnos — módulo Alumnos (RF-01).
 *
 * El backend resolvía el requerimiento completo desde el primer sprint, pero
 * no había pantalla: `api.alumnos.crear` existía y no lo llamaba nadie, así
 * que dar de alta un alumno sólo era posible con una herramienta externa.
 *
 * El legajo no se pide en el formulario: lo asigna el servidor. Y el DNI no se
 * valida acá contra la lista ya cargada —eso daría un falso "está libre" en
 * cuanto dos personas carguen a la vez—; la unicidad la resuelve el índice de
 * la base y el mensaje de conflicto que devuelve el servicio dice con qué
 * legajo choca.
 */

import api from '../api.js';
import { avisar, badge, esc, fecha, filtros, leerFiltros, render, tabla } from '../ui.js';

let cursos = [];
let ultimosFiltros = {};

const nombreCurso = (c) =>
  `${c.nivel?.nombre ?? '—'} · ${c.nombre} "${c.division}" (${c.anioLectivo})`;

async function cargarCursos() {
  if (cursos.length > 0) return cursos;
  const { cursos: lista } = await api.academico.cursos({ activo: true });
  cursos = lista ?? [];
  return cursos;
}

// ==================================================================
// Listado
// ==================================================================

function barraFiltros() {
  return filtros({
    id: 'filtros-alumnos',
    textoBoton: 'Buscar',
    campos: [
      {
        nombre: 'busqueda',
        etiqueta: 'Apellido, nombre, DNI o legajo',
        placeholder: 'Ej.: Gómez',
        valor: ultimosFiltros.busqueda ?? '',
      },
      {
        nombre: 'cursoId',
        etiqueta: 'Curso',
        tipo: 'select',
        valor: ultimosFiltros.cursoId ?? '',
        opciones: [
          { valor: '', texto: 'Todos los cursos' },
          ...cursos.map((c) => ({ valor: String(c.id), texto: nombreCurso(c) })),
        ],
      },
      {
        nombre: 'estado',
        etiqueta: 'Estado',
        tipo: 'select',
        valor: ultimosFiltros.estado ?? 'ACTIVO',
        opciones: [
          { valor: '', texto: 'Todos' },
          { valor: 'ACTIVO', texto: 'Activos' },
          { valor: 'INACTIVO', texto: 'Inactivos' },
          { valor: 'EGRESADO', texto: 'Egresados' },
          { valor: 'SUSPENDIDO', texto: 'Suspendidos' },
        ],
      },
    ],
  });
}

function filaAcciones(a) {
  return `
    <div class="acciones-fila">
      <button type="button" class="btn btn--chico btn--suave" data-editar="${a.id}">
        <i class="fas fa-pen" aria-hidden="true"></i> Editar
      </button>
      ${
        a.estado === 'ACTIVO'
          ? `<button type="button" class="btn btn--chico btn--peligro" data-baja="${a.id}"
                     data-nombre="${esc(`${a.apellido}, ${a.nombres}`)}">
               <i class="fas fa-user-slash" aria-hidden="true"></i> Dar de baja
             </button>`
          : ''
      }
    </div>`;
}

async function listado() {
  const { items } = await api.alumnos.listar({ ...ultimosFiltros, pageSize: 100 });

  return tabla({
    caption: 'Alumnos registrados',
    vacio: 'No hay alumnos que coincidan con la búsqueda.',
    columnas: [
      { clave: 'legajo', titulo: 'Legajo' },
      {
        clave: 'apellido',
        titulo: 'Alumno',
        render: (a) => `${esc(a.apellido)}, ${esc(a.nombres)}`,
      },
      { clave: 'dni', titulo: 'DNI' },
      {
        clave: 'curso',
        titulo: 'Curso',
        render: (a) => (a.curso ? esc(nombreCurso(a.curso)) : '—'),
      },
      { clave: 'fechaNacimiento', titulo: 'Nacimiento', render: (a) => fecha(a.fechaNacimiento) },
      { clave: 'estado', titulo: 'Estado', alinear: 'centro', render: (a) => badge(a.estado) },
      { clave: 'acciones', titulo: 'Acciones', render: filaAcciones },
    ],
    filas: items ?? [],
  });
}

// ==================================================================
// Alta y edición
// ==================================================================

function formulario() {
  const hoy = new Date().toISOString().slice(0, 10);

  return `
    <dialog id="dlg-alumno" class="dialogo" aria-labelledby="dlg-alumno-titulo">
      <form method="dialog" id="form-alumno">
        <h2 id="dlg-alumno-titulo" class="ficha__titulo">
          <i class="fas fa-user-graduate" aria-hidden="true"></i>
          <span id="dlg-alumno-encabezado">Nuevo alumno</span>
        </h2>

        <p class="dialogo__contexto" id="dlg-alumno-contexto">
          El legajo lo asigna el sistema al guardar.
        </p>

        <input type="hidden" id="al-id" name="id">

        <div class="form-grid">
          <div class="campo">
            <label for="al-dni" class="requerido">DNI</label>
            <input type="text" id="al-dni" name="dni" required minlength="6" maxlength="15"
                   inputmode="numeric" placeholder="45123456">
          </div>
          <div class="campo">
            <label for="al-apellido" class="requerido">Apellido</label>
            <input type="text" id="al-apellido" name="apellido" required minlength="2" maxlength="80">
          </div>
          <div class="campo">
            <label for="al-nombres" class="requerido">Nombres</label>
            <input type="text" id="al-nombres" name="nombres" required minlength="2" maxlength="80">
          </div>
          <div class="campo">
            <label for="al-nacimiento" class="requerido">Fecha de nacimiento</label>
            <input type="date" id="al-nacimiento" name="fechaNacimiento" required max="${hoy}">
          </div>
          <div class="campo">
            <label for="al-curso" class="requerido">Curso</label>
            <select id="al-curso" name="cursoId" required></select>
          </div>
          <div class="campo">
            <label for="al-ingreso">Fecha de ingreso</label>
            <input type="date" id="al-ingreso" name="fechaIngreso" value="${hoy}" max="${hoy}">
          </div>
          <div class="campo">
            <label for="al-domicilio" class="requerido">Domicilio</label>
            <input type="text" id="al-domicilio" name="domicilio" required minlength="4" maxlength="200">
          </div>
          <div class="campo">
            <label for="al-localidad">Localidad</label>
            <input type="text" id="al-localidad" name="localidad" maxlength="80" value="Resistencia">
          </div>
          <div class="campo">
            <label for="al-provincia">Provincia</label>
            <input type="text" id="al-provincia" name="provincia" maxlength="80" value="Chaco">
          </div>
          <div class="campo">
            <label for="al-telefono">Teléfono</label>
            <input type="tel" id="al-telefono" name="telefono" maxlength="30" placeholder="362 4123456">
          </div>
          <div class="campo">
            <label for="al-email">Correo</label>
            <input type="email" id="al-email" name="email" maxlength="120">
          </div>
        </div>

        <div class="campo" style="margin-top:14px">
          <label for="al-observaciones">Observaciones</label>
          <textarea id="al-observaciones" name="observaciones" rows="2" maxlength="1000"></textarea>
        </div>

        <p class="campo__error" id="al-error" role="alert" hidden></p>

        <div class="acciones-fila" style="margin-top:18px;justify-content:flex-end">
          <button type="button" class="btn btn--suave" data-cerrar-dialogo>Cancelar</button>
          <button type="submit" class="btn btn--primario" id="al-guardar">
            <i class="fas fa-floppy-disk" aria-hidden="true"></i> Guardar
          </button>
        </div>
      </form>
    </dialog>`;
}

function poblarCursos(seleccionado) {
  const sel = document.getElementById('al-curso');
  sel.innerHTML =
    '<option value="">Seleccioná un curso…</option>' +
    cursos
      .map(
        (c) =>
          `<option value="${c.id}"${String(c.id) === String(seleccionado) ? ' selected' : ''}>` +
          `${esc(nombreCurso(c))} — ${c._count?.alumnos ?? 0}/${c.cupoMaximo}</option>`,
      )
      .join('');
}

async function abrirFormulario(id) {
  const dlg = document.getElementById('dlg-alumno');
  const form = document.getElementById('form-alumno');
  form.reset();
  document.getElementById('al-error').hidden = true;
  document.getElementById('al-id').value = id ?? '';

  const esEdicion = Boolean(id);
  document.getElementById('dlg-alumno-encabezado').textContent = esEdicion
    ? 'Editar alumno'
    : 'Nuevo alumno';

  let alumno = null;
  if (esEdicion) {
    const r = await api.alumnos.obtener(id);
    alumno = r.alumno;
  }

  poblarCursos(alumno?.curso?.id);

  if (alumno) {
    document.getElementById('dlg-alumno-contexto').textContent =
      `Legajo ${alumno.legajo} · alta del ${fecha(alumno.fechaIngreso)}`;
    for (const [campo, valor] of Object.entries({
      'al-dni': alumno.dni,
      'al-apellido': alumno.apellido,
      'al-nombres': alumno.nombres,
      'al-nacimiento': String(alumno.fechaNacimiento).slice(0, 10),
      'al-domicilio': alumno.domicilio,
      'al-localidad': alumno.localidad,
      'al-provincia': alumno.provincia,
      'al-telefono': alumno.telefono,
      'al-email': alumno.email,
      'al-observaciones': alumno.observaciones,
      'al-ingreso': String(alumno.fechaIngreso).slice(0, 10),
    })) {
      document.getElementById(campo).value = valor ?? '';
    }
  } else {
    document.getElementById('dlg-alumno-contexto').textContent =
      'El legajo lo asigna el sistema al guardar.';
  }

  dlg.showModal();
  document.getElementById('al-dni').focus();
}

async function guardar(e) {
  e.preventDefault();

  const form = e.target;
  const error = document.getElementById('al-error');
  const boton = document.getElementById('al-guardar');
  error.hidden = true;

  const datos = leerFiltros(form);
  const id = datos.id;
  delete datos.id;

  boton.disabled = true;
  try {
    if (id) {
      // En la edición no se manda el DNI: es la identidad del legajo y
      // cambiarlo por error dejaría al alumno confundido con otro.
      delete datos.dni;
      await api.alumnos.actualizar(id, datos);
      avisar('Alumno actualizado.', 'ok');
    } else {
      const r = await api.alumnos.crear(datos);
      avisar(`Alumno dado de alta con el legajo ${r.alumno?.legajo ?? ''}.`, 'ok');
    }
    document.getElementById('dlg-alumno').close();
    await dibujar();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo guardar el alumno.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

async function darDeBaja(id, nombre) {
  const estado = window.prompt(
    `Baja de ${nombre}.\n\nEscribí el motivo: INACTIVO, EGRESADO o SUSPENDIDO.`,
    'INACTIVO',
  );
  if (!estado) return;

  const valido = ['INACTIVO', 'EGRESADO', 'SUSPENDIDO'];
  if (!valido.includes(estado.toUpperCase())) {
    avisar(`Estado inválido. Usá uno de: ${valido.join(', ')}.`, 'error');
    return;
  }

  try {
    await api.alumnos.darDeBaja(id, estado.toUpperCase());
    avisar('Alumno dado de baja.', 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo dar de baja al alumno.', 'error');
  }
}

// ==================================================================
// Armado
// ==================================================================

async function dibujar() {
  await render(document.getElementById('lista-alumnos'), listado);
  cablearFilas();
}

function cablearFilas() {
  const nodo = document.getElementById('lista-alumnos');
  if (!nodo) return;

  nodo.querySelectorAll('[data-editar]').forEach((b) => {
    b.addEventListener('click', () => abrirFormulario(Number(b.dataset.editar)));
  });
  nodo.querySelectorAll('[data-baja]').forEach((b) => {
    b.addEventListener('click', () => darDeBaja(Number(b.dataset.baja), b.dataset.nombre));
  });
}

export async function iniciarAdminAlumnos(id) {
  const contenedor = document.getElementById(id);
  if (!contenedor) return;

  await render(contenedor, async () => {
    await cargarCursos();

    return `
      <div class="acciones-fila" style="justify-content:space-between;align-items:center;margin-bottom:16px">
        <p class="subtitulo" style="margin:0">
          Alta, modificación y baja de alumnos. El sistema rechaza un DNI repetido (RF-01).
        </p>
        <button type="button" class="btn btn--primario" id="btn-nuevo-alumno">
          <i class="fas fa-plus" aria-hidden="true"></i> Nuevo alumno
        </button>
      </div>

      ${barraFiltros()}
      <div id="lista-alumnos" style="margin-top:18px"></div>
      ${formulario()}`;
  });

  document.getElementById('btn-nuevo-alumno').addEventListener('click', () => abrirFormulario(null));
  document.getElementById('form-alumno').addEventListener('submit', guardar);

  contenedor.querySelectorAll('[data-cerrar-dialogo]').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('dlg-alumno')?.close());
  });

  const form = document.getElementById('filtros-alumnos');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ultimosFiltros = leerFiltros(form);
    await dibujar();
  });
  form.addEventListener('reset', async () => {
    ultimosFiltros = {};
    setTimeout(dibujar, 0);
  });

  ultimosFiltros = { estado: 'ACTIVO' };
  await dibujar();
}

export default { iniciarAdminAlumnos };
