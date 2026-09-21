/**
 * ABM de profesores — módulo Profesores (RF-04).
 *
 * El requerimiento pide registrar "las materias que un profesor tiene a su
 * cargo y los cursos en los que desarrolla sus actividades". El curso no se
 * elige por separado: viene implícito en la materia, porque cada materia
 * pertenece a un curso. Asignar "Matemática de 3° B" ya dice las dos cosas, y
 * evita el estado incoherente de un profesor asignado a un curso donde no
 * dicta nada.
 *
 * Igual que en alumnos, el legajo lo asigna el servidor.
 */

import api from '../api.js';
import { avisar, badge, esc, estadoVacio, fecha, filtros, leerFiltros, render, tabla } from '../ui.js';

let materiasLibres = [];
let ultimosFiltros = {};

const nombreMateria = (m) =>
  `${m.nombre} — ${m.curso?.nombre ?? '?'} "${m.curso?.division ?? '?'}" (${m.curso?.nivel?.nombre ?? '?'})`;

// ==================================================================
// Listado
// ==================================================================

function barraFiltros() {
  return filtros({
    id: 'filtros-profesores',
    textoBoton: 'Buscar',
    campos: [
      {
        nombre: 'busqueda',
        etiqueta: 'Apellido, nombre, DNI o legajo',
        placeholder: 'Ej.: Ferreyra',
        valor: ultimosFiltros.busqueda ?? '',
      },
      {
        nombre: 'estado',
        etiqueta: 'Estado',
        tipo: 'select',
        valor: ultimosFiltros.estado ?? 'ACTIVO',
        opciones: [
          { valor: '', texto: 'Todos' },
          { valor: 'ACTIVO', texto: 'Activos' },
          { valor: 'LICENCIA', texto: 'En licencia' },
          { valor: 'INACTIVO', texto: 'Inactivos' },
        ],
      },
    ],
  });
}

function filaAcciones(p) {
  const nombre = esc(`${p.apellido}, ${p.nombres}`);
  return `
    <div class="acciones-fila">
      <button type="button" class="btn btn--chico btn--suave" data-editar="${p.id}">
        <i class="fas fa-pen" aria-hidden="true"></i> Editar
      </button>
      <button type="button" class="btn btn--chico btn--suave" data-materias="${p.id}" data-nombre="${nombre}">
        <i class="fas fa-book" aria-hidden="true"></i> Materias
      </button>
      ${
        p.estado === 'ACTIVO'
          ? `<button type="button" class="btn btn--chico btn--peligro" data-baja="${p.id}" data-nombre="${nombre}">
               <i class="fas fa-user-slash" aria-hidden="true"></i> Dar de baja
             </button>`
          : ''
      }
    </div>`;
}

async function listado() {
  const { items } = await api.profesores.listar({ ...ultimosFiltros, pageSize: 100 });

  return tabla({
    caption: 'Profesores registrados',
    vacio: 'No hay profesores que coincidan con la búsqueda.',
    columnas: [
      { clave: 'legajo', titulo: 'Legajo' },
      {
        clave: 'apellido',
        titulo: 'Profesor',
        render: (p) => `${esc(p.apellido)}, ${esc(p.nombres)}`,
      },
      { clave: 'dni', titulo: 'DNI' },
      { clave: 'especialidad', titulo: 'Especialidad' },
      { clave: 'email', titulo: 'Correo' },
      { clave: 'fechaIngreso', titulo: 'Ingreso', render: (p) => fecha(p.fechaIngreso) },
      { clave: 'estado', titulo: 'Estado', alinear: 'centro', render: (p) => badge(p.estado) },
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
    <dialog id="dlg-profesor" class="dialogo" aria-labelledby="dlg-profesor-titulo">
      <form method="dialog" id="form-profesor">
        <h2 id="dlg-profesor-titulo" class="ficha__titulo">
          <i class="fas fa-chalkboard-user" aria-hidden="true"></i>
          <span id="dlg-profesor-encabezado">Nuevo profesor</span>
        </h2>

        <p class="dialogo__contexto" id="dlg-profesor-contexto">
          El legajo lo asigna el sistema al guardar.
        </p>

        <input type="hidden" id="pr-id" name="id">

        <div class="form-grid">
          <div class="campo">
            <label for="pr-dni" class="requerido">DNI</label>
            <input type="text" id="pr-dni" name="dni" required minlength="6" maxlength="15"
                   inputmode="numeric" placeholder="28123456">
          </div>
          <div class="campo">
            <label for="pr-apellido" class="requerido">Apellido</label>
            <input type="text" id="pr-apellido" name="apellido" required minlength="2" maxlength="80">
          </div>
          <div class="campo">
            <label for="pr-nombres" class="requerido">Nombres</label>
            <input type="text" id="pr-nombres" name="nombres" required minlength="2" maxlength="80">
          </div>
          <div class="campo">
            <label for="pr-especialidad" class="requerido">Especialidad</label>
            <input type="text" id="pr-especialidad" name="especialidad" required minlength="2"
                   maxlength="120" placeholder="Matemática">
          </div>
          <div class="campo">
            <label for="pr-email" class="requerido">Correo</label>
            <input type="email" id="pr-email" name="email" required maxlength="120">
          </div>
          <div class="campo">
            <label for="pr-telefono">Teléfono</label>
            <input type="tel" id="pr-telefono" name="telefono" maxlength="30" placeholder="362 4123456">
          </div>
          <div class="campo">
            <label for="pr-domicilio">Domicilio</label>
            <input type="text" id="pr-domicilio" name="domicilio" maxlength="200">
          </div>
          <div class="campo">
            <label for="pr-ingreso">Fecha de ingreso</label>
            <input type="date" id="pr-ingreso" name="fechaIngreso" value="${hoy}" max="${hoy}">
          </div>
        </div>

        <p class="campo__error" id="pr-error" role="alert" hidden></p>

        <div class="acciones-fila" style="margin-top:18px;justify-content:flex-end">
          <button type="button" class="btn btn--suave" data-cerrar-profesor>Cancelar</button>
          <button type="submit" class="btn btn--primario" id="pr-guardar">
            <i class="fas fa-floppy-disk" aria-hidden="true"></i> Guardar
          </button>
        </div>
      </form>
    </dialog>`;
}

async function abrirFormulario(id) {
  const dlg = document.getElementById('dlg-profesor');
  const form = document.getElementById('form-profesor');
  form.reset();
  document.getElementById('pr-error').hidden = true;
  document.getElementById('pr-id').value = id ?? '';

  document.getElementById('dlg-profesor-encabezado').textContent = id
    ? 'Editar profesor'
    : 'Nuevo profesor';

  if (id) {
    const { profesor } = await api.profesores.obtener(id);
    document.getElementById('dlg-profesor-contexto').textContent =
      `Legajo ${profesor.legajo} · alta del ${fecha(profesor.fechaIngreso)}`;
    for (const [campo, valor] of Object.entries({
      'pr-dni': profesor.dni,
      'pr-apellido': profesor.apellido,
      'pr-nombres': profesor.nombres,
      'pr-especialidad': profesor.especialidad,
      'pr-email': profesor.email,
      'pr-telefono': profesor.telefono,
      'pr-domicilio': profesor.domicilio,
      'pr-ingreso': String(profesor.fechaIngreso).slice(0, 10),
    })) {
      document.getElementById(campo).value = valor ?? '';
    }
  } else {
    document.getElementById('dlg-profesor-contexto').textContent =
      'El legajo lo asigna el sistema al guardar.';
  }

  dlg.showModal();
  document.getElementById('pr-dni').focus();
}

async function guardar(e) {
  e.preventDefault();

  const error = document.getElementById('pr-error');
  const boton = document.getElementById('pr-guardar');
  error.hidden = true;

  const datos = leerFiltros(e.target);
  const id = datos.id;
  delete datos.id;

  boton.disabled = true;
  try {
    if (id) {
      delete datos.dni;
      await api.profesores.actualizar(id, datos);
      avisar('Profesor actualizado.', 'ok');
    } else {
      const r = await api.profesores.crear(datos);
      avisar(`Profesor dado de alta con el legajo ${r.profesor?.legajo ?? ''}.`, 'ok');
    }
    document.getElementById('dlg-profesor').close();
    await dibujar();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo guardar el profesor.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

async function darDeBaja(id, nombre) {
  const estado = window.prompt(
    `Baja de ${nombre}.\n\nEscribí el motivo: INACTIVO o LICENCIA.`,
    'LICENCIA',
  );
  if (!estado) return;

  if (!['INACTIVO', 'LICENCIA'].includes(estado.toUpperCase())) {
    avisar('Estado inválido. Usá INACTIVO o LICENCIA.', 'error');
    return;
  }

  try {
    await api.profesores.darDeBaja(id, estado.toUpperCase());
    avisar('Profesor dado de baja.', 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo dar de baja al profesor.', 'error');
  }
}

// ==================================================================
// Materias a cargo — el corazón de RF-04
// ==================================================================

function dialogoMaterias() {
  return `
    <dialog id="dlg-materias" class="dialogo" aria-labelledby="dlg-materias-titulo">
      <h2 id="dlg-materias-titulo" class="ficha__titulo">
        <i class="fas fa-book" aria-hidden="true"></i> Materias a cargo
      </h2>
      <p class="dialogo__contexto" id="dlg-materias-contexto"></p>

      <div id="materias-asignadas"></div>

      <form id="form-asignar" style="margin-top:18px">
        <div class="campo">
          <label for="ma-materia">Asignar una materia sin profesor</label>
          <select id="ma-materia" name="materiaId" required></select>
        </div>
        <p class="campo__error" id="ma-error" role="alert" hidden></p>
        <div class="acciones-fila" style="margin-top:14px;justify-content:flex-end">
          <button type="button" class="btn btn--suave" data-cerrar-materias>Cerrar</button>
          <button type="submit" class="btn btn--primario" id="ma-asignar">
            <i class="fas fa-plus" aria-hidden="true"></i> Asignar
          </button>
        </div>
      </form>
    </dialog>`;
}

let profesorActivo = null;

async function pintarMaterias() {
  const { materias } = await api.academico.materias({ profesorId: profesorActivo, activo: true });

  document.getElementById('materias-asignadas').innerHTML =
    materias && materias.length > 0
      ? tabla({
          caption: 'Materias y cursos a cargo',
          columnas: [
            { clave: 'nombre', titulo: 'Materia' },
            {
              clave: 'curso',
              titulo: 'Curso',
              render: (m) => esc(`${m.curso?.nombre ?? '—'} "${m.curso?.division ?? ''}"`),
            },
            { clave: 'nivel', titulo: 'Nivel', render: (m) => esc(m.curso?.nivel?.nombre ?? '—') },
            { clave: 'cargaHoraria', titulo: 'Horas', alinear: 'centro' },
            {
              clave: 'acciones',
              titulo: '',
              render: (m) => `
                <button type="button" class="btn btn--chico btn--peligro" data-quitar="${m.id}">
                  <i class="fas fa-xmark" aria-hidden="true"></i> Quitar
                </button>`,
            },
          ],
          filas: materias,
        })
      : estadoVacio('Todavía no tiene materias asignadas.', 'fa-book');

  // Las disponibles son las que no tienen profesor: una materia con dos
  // titulares no es un caso que la institución contemple.
  const { materias: libres } = await api.academico.materias({ sinProfesor: true, activo: true });
  materiasLibres = libres ?? [];

  const sel = document.getElementById('ma-materia');
  sel.innerHTML =
    materiasLibres.length > 0
      ? '<option value="">Seleccioná una materia…</option>' +
        materiasLibres
          .map((m) => `<option value="${m.id}">${esc(nombreMateria(m))}</option>`)
          .join('')
      : '<option value="">No hay materias sin profesor asignado</option>';
  sel.disabled = materiasLibres.length === 0;
  document.getElementById('ma-asignar').disabled = materiasLibres.length === 0;

  document.getElementById('materias-asignadas')
    .querySelectorAll('[data-quitar]')
    .forEach((b) => b.addEventListener('click', () => quitarMateria(Number(b.dataset.quitar))));
}

async function abrirMaterias(id, nombre) {
  profesorActivo = id;
  document.getElementById('dlg-materias-contexto').textContent = nombre;
  document.getElementById('ma-error').hidden = true;
  await pintarMaterias();
  document.getElementById('dlg-materias').showModal();
}

async function asignarMateria(e) {
  e.preventDefault();
  const error = document.getElementById('ma-error');
  error.hidden = true;

  const materiaId = document.getElementById('ma-materia').value;
  if (!materiaId) return;

  try {
    await api.profesores.asignarMateria(profesorActivo, Number(materiaId));
    avisar('Materia asignada.', 'ok');
    await pintarMaterias();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo asignar la materia.';
    error.hidden = false;
  }
}

async function quitarMateria(materiaId) {
  try {
    await api.profesores.quitarMateria(materiaId);
    avisar('Materia liberada.', 'ok');
    await pintarMaterias();
  } catch (err) {
    avisar(err?.message || 'No se pudo quitar la materia.', 'error');
  }
}

// ==================================================================
// Armado
// ==================================================================

async function dibujar() {
  await render(document.getElementById('lista-profesores'), listado);

  const nodo = document.getElementById('lista-profesores');
  if (!nodo) return;

  nodo.querySelectorAll('[data-editar]').forEach((b) => {
    b.addEventListener('click', () => abrirFormulario(Number(b.dataset.editar)));
  });
  nodo.querySelectorAll('[data-materias]').forEach((b) => {
    b.addEventListener('click', () => abrirMaterias(Number(b.dataset.materias), b.dataset.nombre));
  });
  nodo.querySelectorAll('[data-baja]').forEach((b) => {
    b.addEventListener('click', () => darDeBaja(Number(b.dataset.baja), b.dataset.nombre));
  });
}

export async function iniciarAdminProfesores(id) {
  const contenedor = document.getElementById(id);
  if (!contenedor) return;

  await render(contenedor, async () => `
      <div class="acciones-fila" style="justify-content:space-between;align-items:center;margin-bottom:16px">
        <p class="subtitulo" style="margin:0">
          Alta, modificación y baja de profesores, y las materias y cursos que tiene a cargo cada uno (RF-04).
        </p>
        <button type="button" class="btn btn--primario" id="btn-nuevo-profesor">
          <i class="fas fa-plus" aria-hidden="true"></i> Nuevo profesor
        </button>
      </div>

      ${barraFiltros()}
      <div id="lista-profesores" style="margin-top:18px"></div>
      ${formulario()}
      ${dialogoMaterias()}`);

  document.getElementById('btn-nuevo-profesor')
    .addEventListener('click', () => abrirFormulario(null));
  document.getElementById('form-profesor').addEventListener('submit', guardar);
  document.getElementById('form-asignar').addEventListener('submit', asignarMateria);

  contenedor.querySelectorAll('[data-cerrar-profesor]').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('dlg-profesor')?.close());
  });
  contenedor.querySelectorAll('[data-cerrar-materias]').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('dlg-materias')?.close());
  });

  const form = document.getElementById('filtros-profesores');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ultimosFiltros = leerFiltros(form);
    await dibujar();
  });
  form.addEventListener('reset', () => {
    ultimosFiltros = {};
    setTimeout(dibujar, 0);
  });

  ultimosFiltros = { estado: 'ACTIVO' };
  await dibujar();
}

export default { iniciarAdminProfesores };
