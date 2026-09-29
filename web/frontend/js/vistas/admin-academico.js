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
import {
  avisar,
  badge,
  esc,
  leerFiltros,
  moneda,
  pieDialogo,
  plantillaDialogo,
  render,
  tabla,
  textosDialogo,
} from '../ui.js';

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
          : `<button type="button" class="btn btn--chico btn--ok" data-reactivar="${id}">
               <i class="fas fa-rotate-left" aria-hidden="true"></i> Reactivar
             </button>`
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
    <div class="form-grid-2">
      <div class="form-group full-width">
        <label for="ac-nombre"><i class="fas fa-layer-group" aria-hidden="true"></i> Nombre *</label>
        <input type="text" id="ac-nombre" name="nombre" class="form-input" required minlength="2" maxlength="60"
               placeholder="Educación Primaria">
      </div>
      <div class="form-group">
        <label for="ac-orden"><i class="fas fa-arrow-down-1-9" aria-hidden="true"></i> Orden *</label>
        <input type="number" id="ac-orden" name="orden" class="form-input" required min="1" max="99" value="1">
        <small class="form-ayuda">En qué posición se muestra el nivel.</small>
      </div>
      <div class="form-group">
        <label for="ac-cuotaMensual"><i class="fas fa-money-bill" aria-hidden="true"></i> Cuota mensual base</label>
        <input type="number" id="ac-cuotaMensual" name="cuotaMensual" class="form-input" min="0" step="0.01" value="0">
        <small class="form-ayuda">La factura copia el importe: cambiarlo no altera el histórico.</small>
      </div>
      <div class="form-group full-width">
        <label for="ac-descripcion"><i class="fas fa-align-left" aria-hidden="true"></i> Descripción</label>
        <input type="text" id="ac-descripcion" name="descripcion" class="form-input" maxlength="300">
      </div>
    </div>`,

  cursos: () => `
    <div class="form-grid-2">
      <div class="form-group">
        <label for="ac-nivelId"><i class="fas fa-layer-group" aria-hidden="true"></i> Nivel *</label>
        <select id="ac-nivelId" name="nivelId" class="form-select" required>
          <option value="">Seleccioná un nivel…</option>
          ${niveles
            .filter((n) => n.activo)
            .map((n) => `<option value="${n.id}">${esc(n.nombre)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="ac-nombre"><i class="fas fa-door-open" aria-hidden="true"></i> Nombre del curso *</label>
        <input type="text" id="ac-nombre" name="nombre" class="form-input" required maxlength="60" placeholder="3° grado">
      </div>
      <div class="form-group">
        <label for="ac-division"><i class="fas fa-font" aria-hidden="true"></i> División</label>
        <input type="text" id="ac-division" name="division" class="form-input" maxlength="10" value="A">
      </div>
      <div class="form-group">
        <label for="ac-turno"><i class="fas fa-sun" aria-hidden="true"></i> Turno</label>
        <select id="ac-turno" name="turno" class="form-select">
          ${TURNOS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="ac-anioLectivo"><i class="fas fa-calendar" aria-hidden="true"></i> Ciclo lectivo *</label>
        <input type="number" id="ac-anioLectivo" name="anioLectivo" class="form-input" required min="2000" max="2100"
               value="${anioActual}">
      </div>
      <div class="form-group">
        <label for="ac-cupoMaximo"><i class="fas fa-users" aria-hidden="true"></i> Cupo máximo</label>
        <input type="number" id="ac-cupoMaximo" name="cupoMaximo" class="form-input" min="1" max="100" value="30">
      </div>
    </div>`,

  materias: () => `
    <div class="form-grid-2">
      <div class="form-group">
        <label for="ac-nombre"><i class="fas fa-book" aria-hidden="true"></i> Nombre *</label>
        <input type="text" id="ac-nombre" name="nombre" class="form-input" required minlength="2" maxlength="80"
               placeholder="Matemática">
      </div>
      <div class="form-group">
        <label for="ac-cargaHoraria"><i class="fas fa-clock" aria-hidden="true"></i> Carga horaria semanal</label>
        <input type="number" id="ac-cargaHoraria" name="cargaHoraria" class="form-input" min="1" max="20" value="4">
      </div>
      <div class="form-group full-width">
        <label for="ac-cursoId"><i class="fas fa-door-open" aria-hidden="true"></i> Curso *</label>
        <select id="ac-cursoId" name="cursoId" class="form-select" required>
          <option value="">Seleccioná un curso…</option>
          ${cursos
            .filter((c) => c.activo)
            .map((c) => `<option value="${c.id}">${esc(nombreCurso(c))}</option>`)
            .join('')}
        </select>
      </div>
      <div class="form-group full-width">
        <label for="ac-profesorId"><i class="fas fa-chalkboard-user" aria-hidden="true"></i> Profesor a cargo</label>
        <select id="ac-profesorId" name="profesorId" class="form-select">
          <option value="">Sin asignar por ahora</option>
          ${profesores
            .map(
              (p) =>
                `<option value="${p.id}">${esc(`${p.apellido}, ${p.nombres}`)} — ${esc(p.especialidad ?? '')}</option>`,
            )
            .join('')}
        </select>
      </div>
    </div>`,
};

function dialogo() {
  return plantillaDialogo({
    id: 'dlg-academico',
    icono: 'fa-graduation-cap',
    titulo: '',
    cuerpo: `
      <form id="form-academico" novalidate>
        <input type="hidden" id="ac-id" name="id">
        <div id="dlg-ac-campos"></div>
        <p class="campo__error" id="ac-error" role="alert" hidden></p>
        ${pieDialogo({ textoGuardar: 'Guardar', idGuardar: 'ac-guardar' })}
      </form>`,
  });
}

const SINGULAR = { niveles: 'nivel', cursos: 'curso', materias: 'materia' };
const NUEVO = { niveles: 'Nuevo nivel', cursos: 'Nuevo curso', materias: 'Nueva materia' };
const EDITAR = { niveles: 'Editar nivel', cursos: 'Editar curso', materias: 'Editar materia' };
const GUARDADO = { niveles: 'Nivel guardado.', cursos: 'Curso guardado.', materias: 'Materia guardada.' };
const SUBTITULO = {
  niveles: 'Inicial, Primario, Secundario: la estructura de la que cuelgan los cursos.',
  cursos: 'Cada curso pertenece a un nivel y a un ciclo lectivo.',
  materias: 'Cada materia pertenece a un curso; el profesor se puede asignar después.',
};

function registroActual(id) {
  if (solapa === 'niveles') return niveles.find((n) => n.id === id);
  if (solapa === 'cursos') return cursos.find((c) => c.id === id);
  return null;
}

async function abrirFormulario(id) {
  const dlg = document.getElementById('dlg-academico');
  const form = document.getElementById('form-academico');

  document.getElementById('dlg-ac-campos').innerHTML = CAMPOS[solapa]();
  form.reset();
  document.getElementById('ac-error').hidden = true;
  document.getElementById('ac-id').value = id ?? '';
  textosDialogo(dlg, {
    titulo: id ? EDITAR[solapa] : NUEVO[solapa],
    subtitulo: SUBTITULO[solapa],
  });

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

  window.abrirDialogo(dlg, { foco: '#ac-nombre' });
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
    if (id) await EDICION[solapa](id, datos);
    else await ALTA[solapa](datos);

    avisar(GUARDADO[solapa], 'ok');
    window.cerrarDialogo('dlg-academico');
    await refrescarCatalogos();
    await pintar();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo guardar.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

const BAJA_TEXTOS = {
  niveles: {
    titulo: 'Dar de baja el nivel',
    consecuencias: [
      'Deja de ofrecerse para cursos nuevos.',
      'El sistema no lo deja dar de baja mientras tenga cursos activos: primero hay que dar de baja esos cursos.',
      'Se puede reactivar después.',
    ],
  },
  cursos: {
    titulo: 'Dar de baja el curso',
    consecuencias: [
      'No admite más alumnos ni materias nuevas.',
      'El sistema no lo deja dar de baja mientras tenga alumnos activos: hay que reubicarlos o darlos de baja antes.',
      'Se puede reactivar después.',
    ],
  },
  materias: {
    titulo: 'Dar de baja la materia',
    consecuencias: [
      'Deja de figurar en el curso y no se le pueden asignar notas nuevas.',
      'Las notas que ya tiene se conservan.',
      'Se puede reactivar después.',
    ],
  },
};

async function darDeBaja(id) {
  const textos = BAJA_TEXTOS[solapa];
  const confirmado = await window.uxBaja({
    titulo: textos.titulo,
    icono: 'fa-ban',
    consecuencias: textos.consecuencias,
  });
  if (!confirmado) return;

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

// Un curso se reactiva con su nivel activo, y una materia con su curso
// activo; si no, el servidor dice qué hay que reactivar primero.
const REACTIVAR_TEXTOS = {
  niveles: { titulo: 'Reactivar el nivel', mensaje: 'Vuelve a ofrecerse para cursos nuevos.' },
  cursos: { titulo: 'Reactivar el curso', mensaje: 'Vuelve a admitir alumnos y materias. Su nivel tiene que estar activo.' },
  materias: { titulo: 'Reactivar la materia', mensaje: 'Vuelve a figurar en su curso. El curso tiene que estar activo.' },
};

async function reactivar(id) {
  const textos = REACTIVAR_TEXTOS[solapa];
  const ok = await window.uxConfirm(textos.mensaje, { title: textos.titulo, okLabel: 'Reactivar' });
  if (!ok) return;

  try {
    await EDICION[solapa](id, { activo: true });
    avisar('Reactivado.', 'ok');
    await refrescarCatalogos();
    await pintar();
  } catch (err) {
    avisar(err?.message || 'No se pudo reactivar.', 'error');
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

  document.getElementById('btn-nuevo-academico')?.addEventListener('click', () => abrirFormulario(null));
  panel.querySelectorAll('[data-editar]').forEach((b) => {
    b.addEventListener('click', () => abrirFormulario(Number(b.dataset.editar)));
  });
  panel.querySelectorAll('[data-baja]').forEach((b) => {
    b.addEventListener('click', () => darDeBaja(Number(b.dataset.baja)));
  });
  panel.querySelectorAll('[data-reactivar]').forEach((b) => {
    b.addEventListener('click', () => reactivar(Number(b.dataset.reactivar)));
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

  await pintar();
}

export default { iniciarAdminAcademico };
