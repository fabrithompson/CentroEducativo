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
import {
  avisar,
  badge,
  esc,
  estadoVacio,
  fecha,
  filtros,
  leerFiltros,
  pieDialogo,
  plantillaDialogo,
  render,
  tabla,
  textosDialogo,
} from '../ui.js';

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
          : `<button type="button" class="btn btn--chico btn--ok" data-reactivar="${p.id}" data-nombre="${nombre}">
               <i class="fas fa-rotate-left" aria-hidden="true"></i> Reactivar
             </button>`
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

  const cuerpo = `
    <form id="form-profesor" novalidate>
      <input type="hidden" id="pr-id" name="id">

      <div class="form-grid-2">
        <div class="form-group">
          <label for="pr-apellido"><i class="fas fa-user" aria-hidden="true"></i> Apellido *</label>
          <input type="text" id="pr-apellido" name="apellido" class="form-input" required minlength="2" maxlength="80">
        </div>
        <div class="form-group">
          <label for="pr-nombres"><i class="fas fa-user" aria-hidden="true"></i> Nombres *</label>
          <input type="text" id="pr-nombres" name="nombres" class="form-input" required minlength="2" maxlength="80">
        </div>
        <div class="form-group">
          <label for="pr-dni"><i class="fas fa-id-card" aria-hidden="true"></i> DNI *</label>
          <input type="text" id="pr-dni" name="dni" class="form-input" required minlength="6" maxlength="15"
                 inputmode="numeric" placeholder="28123456">
        </div>
        <div class="form-group">
          <label for="pr-especialidad"><i class="fas fa-graduation-cap" aria-hidden="true"></i> Especialidad *</label>
          <input type="text" id="pr-especialidad" name="especialidad" class="form-input" required minlength="2"
                 maxlength="120" placeholder="Matemática">
        </div>
        <div class="form-group">
          <label for="pr-email"><i class="fas fa-envelope" aria-hidden="true"></i> Correo *</label>
          <input type="email" id="pr-email" name="email" class="form-input" required maxlength="120">
        </div>
        <div class="form-group">
          <label for="pr-telefono"><i class="fas fa-phone" aria-hidden="true"></i> Teléfono</label>
          <input type="tel" id="pr-telefono" name="telefono" class="form-input" maxlength="30" placeholder="362 4123456">
        </div>
        <div class="form-group">
          <label for="pr-domicilio"><i class="fas fa-house" aria-hidden="true"></i> Domicilio</label>
          <input type="text" id="pr-domicilio" name="domicilio" class="form-input" maxlength="200">
        </div>
        <div class="form-group">
          <label for="pr-ingreso"><i class="fas fa-calendar-check" aria-hidden="true"></i> Fecha de ingreso</label>
          <input type="date" id="pr-ingreso" name="fechaIngreso" class="form-input" value="${hoy}" max="${hoy}">
        </div>
      </div>

      <p class="campo__error" id="pr-error" role="alert" hidden></p>
      ${pieDialogo({ textoGuardar: 'Guardar', idGuardar: 'pr-guardar' })}
    </form>`;

  return plantillaDialogo({
    id: 'dlg-profesor',
    icono: 'fa-chalkboard-user',
    titulo: 'Nuevo profesor',
    subtitulo: 'El legajo lo asigna el sistema al guardar.',
    cuerpo,
  });
}

async function abrirFormulario(id) {
  const dlg = document.getElementById('dlg-profesor');
  const form = document.getElementById('form-profesor');
  form.reset();
  document.getElementById('pr-error').hidden = true;
  document.getElementById('pr-id').value = id ?? '';

  if (id) {
    const { profesor } = await api.profesores.obtener(id);
    textosDialogo(dlg, {
      titulo: 'Editar profesor',
      subtitulo: `Legajo ${profesor.legajo} · alta del ${fecha(profesor.fechaIngreso)}`,
    });
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
    textosDialogo(dlg, {
      titulo: 'Nuevo profesor',
      subtitulo: 'El legajo lo asigna el sistema al guardar.',
    });
  }

  window.abrirDialogo(dlg);
}

async function guardar(e) {
  e.preventDefault();

  const error = document.getElementById('pr-error');
  const boton = document.getElementById('pr-guardar');
  error.hidden = true;

  const form = e.target;
  if (!form.checkValidity()) {
    const invalido = form.querySelector(':invalid');
    const etiqueta = form.querySelector(`label[for="${invalido.id}"]`)?.textContent.replace('*', '').trim();
    error.textContent = `Revisá el campo "${etiqueta}": ${invalido.validationMessage}`;
    error.hidden = false;
    invalido.focus();
    return;
  }

  const datos = leerFiltros(form);
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
    window.cerrarDialogo('dlg-profesor');
    await dibujar();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo guardar el profesor.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

async function darDeBaja(id, nombre) {
  const r = await window.uxBaja({
    titulo: 'Dar de baja al profesor',
    subtitulo: nombre,
    etiquetaEstado: 'Tipo de baja',
    opciones: [
      { valor: 'LICENCIA', texto: 'Licencia — vuelve más adelante' },
      { valor: 'INACTIVO', texto: 'Inactivo — deja la institución' },
    ],
    valor: 'LICENCIA',
    consecuencias: [
      'En licencia conserva sus materias; como inactivo, las materias quedan sin profesor para reasignarlas.',
      'Si es responsable de algún deporte activo, el sistema no deja darlo de baja como inactivo hasta reasignarlo.',
      'Se puede reactivar después.',
    ],
  });
  if (!r) return;

  try {
    await api.profesores.darDeBaja(id, r.estado);
    avisar('Profesor dado de baja.', 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo dar de baja al profesor.', 'error');
  }
}

async function reactivar(id, nombre) {
  const ok = await window.uxConfirm('Vuelve a estar activo y se le pueden asignar materias.', {
    title: 'Reactivar profesor',
    subtitle: nombre,
    okLabel: 'Reactivar',
    consecuencias: [
      'Si estaba inactivo, sus materias anteriores ya se liberaron: hay que asignárselas de nuevo desde "Materias".',
    ],
  });
  if (!ok) return;

  try {
    await api.profesores.actualizar(id, { estado: 'ACTIVO' });
    avisar('Profesor reactivado.', 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo reactivar al profesor.', 'error');
  }
}

// ==================================================================
// Materias a cargo — el corazón de RF-04
// ==================================================================

function dialogoMaterias() {
  const cuerpo = `
    <div id="materias-asignadas"></div>

    <form id="form-asignar" novalidate style="margin-top:18px">
      <div class="form-group">
        <label for="ma-materia"><i class="fas fa-book" aria-hidden="true"></i> Asignar una materia sin profesor *</label>
        <select id="ma-materia" name="materiaId" class="form-select" required></select>
        <small class="form-ayuda">Cada materia pertenece a un curso: asignarla ya dice en qué curso da clase.</small>
      </div>
      <p class="campo__error" id="ma-error" role="alert" hidden></p>
      <div class="modal-pie">
        <button type="button" class="btn-cancelar" data-cerrar-dialogo>Cerrar</button>
        <button type="submit" class="btn-guardar" id="ma-asignar">
          <i class="fas fa-plus" aria-hidden="true"></i> Asignar
        </button>
      </div>
    </form>`;

  return plantillaDialogo({
    id: 'dlg-materias',
    icono: 'fa-book',
    titulo: 'Materias a cargo',
    subtitulo: '',
    cuerpo,
  });
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
  const dlg = document.getElementById('dlg-materias');
  textosDialogo(dlg, { subtitulo: nombre });
  document.getElementById('ma-error').hidden = true;
  await pintarMaterias();
  window.abrirDialogo(dlg);
}

async function asignarMateria(e) {
  e.preventDefault();
  const error = document.getElementById('ma-error');
  error.hidden = true;

  const materiaId = document.getElementById('ma-materia').value;
  if (!materiaId) {
    error.textContent = 'Elegí una materia de la lista.';
    error.hidden = false;
    return;
  }

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
  const ok = await window.uxConfirm(
    'La materia queda sin profesor a cargo hasta que se le asigne otro.',
    { title: 'Quitar materia', danger: true, okLabel: 'Quitar' },
  );
  if (!ok) return;

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
  nodo.querySelectorAll('[data-reactivar]').forEach((b) => {
    b.addEventListener('click', () => reactivar(Number(b.dataset.reactivar), b.dataset.nombre));
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
