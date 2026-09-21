/**
 * ABM de la estructura académica: niveles, cursos y materias.
 *
 * Es el catálogo del que cuelga todo lo demás, y hasta ahora vivía sólo en la
 * base: el seed lo cargaba y no había manera de tocarlo desde la aplicación.
 * Sin esta pantalla, el alta de alumnos pedía un `cursoId` imposible de
 * averiguar y la asignación de materias a un profesor, un `materiaId` igual de
 * inaccesible.
 *
 * Las tres pestañas comparten la misma mecánica —listar, un diálogo de alta y
 * edición, baja lógica— y están en un solo archivo porque las tres entidades
 * se editan juntas: crear un curso sin ver sus niveles, o una materia sin ver
 * sus cursos, obliga a ir y volver.
 */

import api from '../api.js';
import { avisar, badge, esc, leerFiltros, moneda, render, tabla } from '../ui.js';

const TURNOS = [
  ['MANANA', 'Mañana'],
  ['TARDE', 'Tarde'],
  ['JORNADA_COMPLETA', 'Jornada completa'],
];

const SOLAPAS = {
  niveles: { titulo: 'Niveles', icono: 'fa-layer-group' },
  cursos: { titulo: 'Cursos', icono: 'fa-door-open' },
  materias: { titulo: 'Materias', icono: 'fa-book' },
};

let solapa = 'niveles';
let niveles = [];
let cursos = [];
let profesores = [];

const nombreCurso = (c) =>
  `${c.nivel?.nombre ?? '—'} · ${c.nombre} "${c.division}" (${c.anioLectivo})`;

async function refrescarCatalogos() {
  const [n, c, p] = await Promise.all([
    api.academico.niveles(),
    api.academico.cursos(),
    api.profesores.listar({ estado: 'ACTIVO', pageSize: 100 }),
  ]);
  niveles = n.niveles ?? [];
  cursos = c.cursos ?? [];
  profesores = p.items ?? [];
}

const estadoDe = (activo) => badge(activo ? 'ACTIVO' : 'INACTIVO');

function botonesFila(id, activo) {
  return `
    <div class="acciones-fila">
      <button type="button" class="btn btn--chico btn--suave" data-editar="${id}">
        <i class="fas fa-pen" aria-hidden="true"></i> Editar
      </button>
      ${
        activo
          ? `<button type="button" class="btn btn--chico btn--peligro" data-baja="${id}">
               <i class="fas fa-ban" aria-hidden="true"></i> Dar de baja
             </button>`
          : ''
      }
    </div>`;
}

// ==================================================================
// Tablas por solapa
// ==================================================================

const TABLAS = {
  niveles: () =>
    tabla({
      caption: 'Niveles educativos',
      vacio: 'Todavía no hay niveles cargados.',
      columnas: [
        { clave: 'orden', titulo: 'Orden', alinear: 'centro' },
        { clave: 'nombre', titulo: 'Nivel' },
        { clave: 'descripcion', titulo: 'Descripción' },
        {
          clave: 'cuotaMensual',
          titulo: 'Cuota base',
          alinear: 'derecha',
          render: (n) => moneda(n.cuotaMensual),
        },
        {
          clave: 'cursos',
          titulo: 'Cursos',
          alinear: 'centro',
          render: (n) => String(n._count?.cursos ?? 0),
        },
        { clave: 'activo', titulo: 'Estado', alinear: 'centro', render: (n) => estadoDe(n.activo) },
        { clave: 'acciones', titulo: 'Acciones', render: (n) => botonesFila(n.id, n.activo) },
      ],
      filas: niveles,
    }),

  cursos: () =>
    tabla({
      caption: 'Cursos por nivel y ciclo lectivo',
      vacio: 'Todavía no hay cursos cargados.',
      columnas: [
        { clave: 'nivel', titulo: 'Nivel', render: (c) => esc(c.nivel?.nombre ?? '—') },
        { clave: 'nombre', titulo: 'Curso' },
        { clave: 'division', titulo: 'División', alinear: 'centro' },
        {
          clave: 'turno',
          titulo: 'Turno',
          render: (c) => esc(TURNOS.find(([v]) => v === c.turno)?.[1] ?? c.turno),
        },
        { clave: 'anioLectivo', titulo: 'Ciclo', alinear: 'centro' },
        {
          clave: 'ocupacion',
          titulo: 'Matrícula',
          alinear: 'centro',
          render: (c) => `${c._count?.alumnos ?? 0} / ${c.cupoMaximo}`,
        },
        {
          clave: 'materias',
          titulo: 'Materias',
          alinear: 'centro',
          render: (c) => String(c._count?.materias ?? 0),
        },
        { clave: 'activo', titulo: 'Estado', alinear: 'centro', render: (c) => estadoDe(c.activo) },
        { clave: 'acciones', titulo: 'Acciones', render: (c) => botonesFila(c.id, c.activo) },
      ],
      filas: cursos,
    }),

  materias: async () => {
    const { materias } = await api.academico.materias();
    return tabla({
      caption: 'Materias por curso',
      vacio: 'Todavía no hay materias cargadas.',
      columnas: [
        { clave: 'nombre', titulo: 'Materia' },
        {
          clave: 'curso',
          titulo: 'Curso',
          render: (m) => esc(m.curso ? nombreCurso(m.curso) : '—'),
        },
        {
          clave: 'profesor',
          titulo: 'Profesor a cargo',
          render: (m) =>
            m.profesor
              ? esc(`${m.profesor.apellido}, ${m.profesor.nombres}`)
              : '<span class="badge badge--espera">sin asignar</span>',
        },
        { clave: 'cargaHoraria', titulo: 'Horas', alinear: 'centro' },
        { clave: 'activo', titulo: 'Estado', alinear: 'centro', render: (m) => estadoDe(m.activo) },
        { clave: 'acciones', titulo: 'Acciones', render: (m) => botonesFila(m.id, m.activo) },
      ],
      filas: materias ?? [],
    });
  },
};

// ==================================================================
// Formularios
// ==================================================================

const anioActual = new Date().getFullYear();

const CAMPOS = {
  niveles: () => `
    <div class="form-grid">
      <div class="campo">
        <label for="ac-nombre" class="requerido">Nombre</label>
        <input type="text" id="ac-nombre" name="nombre" required minlength="2" maxlength="60"
               placeholder="Educación Primaria">
      </div>
      <div class="campo">
        <label for="ac-orden" class="requerido">Orden</label>
        <input type="number" id="ac-orden" name="orden" required min="1" max="99" value="1">
        <span class="ayuda">Define en qué secuencia se muestran los niveles.</span>
      </div>
      <div class="campo">
        <label for="ac-cuota">Cuota mensual base</label>
        <input type="number" id="ac-cuota" name="cuotaMensual" min="0" step="0.01" value="0">
        <span class="ayuda">La factura copia el importe, así que cambiarlo no altera el histórico.</span>
      </div>
    </div>
    <div class="campo" style="margin-top:14px">
      <label for="ac-descripcion">Descripción</label>
      <input type="text" id="ac-descripcion" name="descripcion" maxlength="300">
    </div>`,

  cursos: () => `
    <div class="form-grid">
      <div class="campo">
        <label for="ac-nivelId" class="requerido">Nivel</label>
        <select id="ac-nivelId" name="nivelId" required>
          <option value="">Seleccioná un nivel…</option>
          ${niveles
            .filter((n) => n.activo)
            .map((n) => `<option value="${n.id}">${esc(n.nombre)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="campo">
        <label for="ac-nombre" class="requerido">Nombre del curso</label>
        <input type="text" id="ac-nombre" name="nombre" required maxlength="60" placeholder="3° grado">
      </div>
      <div class="campo">
        <label for="ac-division">División</label>
        <input type="text" id="ac-division" name="division" maxlength="10" value="A">
      </div>
      <div class="campo">
        <label for="ac-turno">Turno</label>
        <select id="ac-turno" name="turno">
          ${TURNOS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label for="ac-anioLectivo" class="requerido">Ciclo lectivo</label>
        <input type="number" id="ac-anioLectivo" name="anioLectivo" required min="2000" max="2100"
               value="${anioActual}">
      </div>
      <div class="campo">
        <label for="ac-cupoMaximo">Cupo máximo</label>
        <input type="number" id="ac-cupoMaximo" name="cupoMaximo" min="1" max="100" value="30">
      </div>
    </div>`,

  materias: () => `
    <div class="form-grid">
      <div class="campo">
        <label for="ac-nombre" class="requerido">Nombre</label>
        <input type="text" id="ac-nombre" name="nombre" required minlength="2" maxlength="80"
               placeholder="Matemática">
      </div>
      <div class="campo">
        <label for="ac-cursoId" class="requerido">Curso</label>
        <select id="ac-cursoId" name="cursoId" required>
          <option value="">Seleccioná un curso…</option>
          ${cursos
            .filter((c) => c.activo)
            .map((c) => `<option value="${c.id}">${esc(nombreCurso(c))}</option>`)
            .join('')}
        </select>
      </div>
      <div class="campo">
        <label for="ac-profesorId">Profesor a cargo</label>
        <select id="ac-profesorId" name="profesorId">
          <option value="">Sin asignar por ahora</option>
          ${profesores
            .map(
              (p) =>
                `<option value="${p.id}">${esc(`${p.apellido}, ${p.nombres}`)} — ${esc(p.especialidad ?? '')}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="campo">
        <label for="ac-cargaHoraria">Carga horaria semanal</label>
        <input type="number" id="ac-cargaHoraria" name="cargaHoraria" min="1" max="20" value="4">
      </div>
    </div>`,
};

function dialogo() {
  return `
    <dialog id="dlg-academico" class="dialogo" aria-labelledby="dlg-ac-titulo">
      <form method="dialog" id="form-academico">
        <h2 id="dlg-ac-titulo" class="ficha__titulo">
          <i class="fas fa-graduation-cap" aria-hidden="true"></i>
          <span id="dlg-ac-encabezado"></span>
        </h2>
        <input type="hidden" id="ac-id" name="id">
        <div id="dlg-ac-campos"></div>
        <p class="campo__error" id="ac-error" role="alert" hidden></p>
        <div class="acciones-fila" style="margin-top:18px;justify-content:flex-end">
          <button type="button" class="btn btn--suave" data-cerrar-academico>Cancelar</button>
          <button type="submit" class="btn btn--primario" id="ac-guardar">
            <i class="fas fa-floppy-disk" aria-hidden="true"></i> Guardar
          </button>
        </div>
      </form>
    </dialog>`;
}

const SINGULAR = { niveles: 'nivel', cursos: 'curso', materias: 'materia' };

function registroActual(id) {
  if (solapa === 'niveles') return niveles.find((n) => n.id === id);
  if (solapa === 'cursos') return cursos.find((c) => c.id === id);
  return null;
}

async function abrirDialogo(id) {
  const dlg = document.getElementById('dlg-academico');
  const form = document.getElementById('form-academico');

  document.getElementById('dlg-ac-campos').innerHTML = CAMPOS[solapa]();
  form.reset();
  document.getElementById('ac-error').hidden = true;
  document.getElementById('ac-id').value = id ?? '';
  document.getElementById('dlg-ac-encabezado').textContent =
    `${id ? 'Editar' : 'Nuevo'} ${SINGULAR[solapa]}`;

  if (id) {
    // Materias no está cacheado: es la lista más larga y cambia más seguido.
    let registro = registroActual(id);
    if (!registro && solapa === 'materias') {
      const { materias } = await api.academico.materias();
      registro = (materias ?? []).find((m) => m.id === id);
    }

    if (registro) {
      const valores = {
        nombre: registro.nombre,
        orden: registro.orden,
        cuotaMensual: registro.cuotaMensual,
        descripcion: registro.descripcion,
        nivelId: registro.nivel?.id,
        division: registro.division,
        turno: registro.turno,
        anioLectivo: registro.anioLectivo,
        cupoMaximo: registro.cupoMaximo,
        cursoId: registro.curso?.id,
        profesorId: registro.profesor?.id,
        cargaHoraria: registro.cargaHoraria,
      };
      for (const [campo, valor] of Object.entries(valores)) {
        const nodo = document.getElementById(`ac-${campo}`);
        if (nodo && valor !== undefined && valor !== null) nodo.value = valor;
      }
    }
  }

  dlg.showModal();
  document.getElementById('ac-nombre')?.focus();
}

const ALTA = {
  niveles: (d) => api.academico.crearNivel(d),
  cursos: (d) => api.academico.crearCurso(d),
  materias: (d) => api.academico.crearMateria(d),
};
const EDICION = {
  niveles: (id, d) => api.academico.actualizarNivel(id, d),
  cursos: (id, d) => api.academico.actualizarCurso(id, d),
  materias: (id, d) => api.academico.actualizarMateria(id, d),
};
const BAJA = {
  niveles: (id) => api.academico.darDeBajaNivel(id),
  cursos: (id) => api.academico.darDeBajaCurso(id),
  materias: (id) => api.academico.darDeBajaMateria(id),
};

async function guardar(e) {
  e.preventDefault();

  const error = document.getElementById('ac-error');
  const boton = document.getElementById('ac-guardar');
  error.hidden = true;

  const datos = leerFiltros(e.target);
  const id = datos.id;
  delete datos.id;

  boton.disabled = true;
  try {
    if (id) await EDICION[solapa](id, datos);
    else await ALTA[solapa](datos);

    avisar(`${SINGULAR[solapa]} guardado.`, 'ok');
    document.getElementById('dlg-academico').close();
    await refrescarCatalogos();
    await pintar();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo guardar.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

async function darDeBaja(id) {
  if (!window.confirm(`¿Dar de baja este ${SINGULAR[solapa]}?`)) return;

  try {
    await BAJA[solapa](id);
    avisar('Dado de baja.', 'ok');
    await refrescarCatalogos();
    await pintar();
  } catch (err) {
    // El servicio se niega cuando todavía cuelga algo —un nivel con cursos
    // activos, un curso con alumnos—, y ese motivo es justo lo que hay que
    // mostrar para que la persona sepa qué ordenar primero.
    avisar(err?.message || 'No se pudo dar de baja.', 'error');
  }
}

// ==================================================================
// Armado
// ==================================================================

function pestanias() {
  return `
    <div class="pestanias" role="tablist" aria-label="Estructura académica">
      ${Object.entries(SOLAPAS)
        .map(
          ([clave, s]) => `
        <button type="button" role="tab" id="tab-ac-${clave}"
                aria-selected="${clave === solapa}"
                aria-controls="panel-academico"
                data-solapa="${clave}"
                class="pestania${clave === solapa ? ' pestania--activa' : ''}">
          <i class="fas ${s.icono}" aria-hidden="true"></i> ${esc(s.titulo)}
        </button>`,
        )
        .join('')}
    </div>`;
}

async function pintar() {
  const panel = document.getElementById('panel-academico');
  if (!panel) return;

  await render(panel, async () => {
    const contenido = await TABLAS[solapa]();
    return `
      <div class="acciones-fila" style="justify-content:flex-end;margin-bottom:14px">
        <button type="button" class="btn btn--primario" id="btn-nuevo-academico">
          <i class="fas fa-plus" aria-hidden="true"></i> Nuevo ${SINGULAR[solapa]}
        </button>
      </div>
      ${contenido}`;
  });

  document.getElementById('btn-nuevo-academico')?.addEventListener('click', () => abrirDialogo(null));
  panel.querySelectorAll('[data-editar]').forEach((b) => {
    b.addEventListener('click', () => abrirDialogo(Number(b.dataset.editar)));
  });
  panel.querySelectorAll('[data-baja]').forEach((b) => {
    b.addEventListener('click', () => darDeBaja(Number(b.dataset.baja)));
  });
}

export async function iniciarAdminAcademico(id) {
  const contenedor = document.getElementById(id);
  if (!contenedor) return;

  await render(contenedor, async () => {
    await refrescarCatalogos();
    return `
      <p class="subtitulo">
        Niveles, cursos y materias. Es la estructura de la que dependen el alta de alumnos
        y la asignación de materias a cada profesor.
      </p>
      ${pestanias()}
      <div id="panel-academico" role="tabpanel" aria-labelledby="tab-ac-${solapa}" tabindex="0"></div>
      ${dialogo()}`;
  });

  contenedor.querySelectorAll('[data-solapa]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      solapa = btn.dataset.solapa;
      contenedor.querySelectorAll('.pestania').forEach((b) => {
        const activa = b === btn;
        b.classList.toggle('pestania--activa', activa);
        b.setAttribute('aria-selected', String(activa));
      });
      document
        .getElementById('panel-academico')
        .setAttribute('aria-labelledby', `tab-ac-${solapa}`);
      await pintar();
    });
  });

  document.getElementById('form-academico').addEventListener('submit', guardar);
  contenedor.querySelectorAll('[data-cerrar-academico]').forEach((b) => {
    b.addEventListener('click', () => document.getElementById('dlg-academico')?.close());
  });

  await pintar();
}

export default { iniciarAdminAcademico };
