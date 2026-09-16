/**
 * Panel del docente — materias y cursos a cargo.
 *
 * Responde a "listado de alumnos por curso y por materia": el docente elige una
 * de sus materias y ve el curso completo con los datos de contacto que necesita
 * para el día a día.
 *
 * El perfil de profesor se resuelve por el usuario de la sesión. Un docente
 * puede tener cuenta de campus sin ficha de `Profesor` cargada todavía —pasa
 * mientras Administración completa los legajos— así que ese caso se explica en
 * pantalla en vez de mostrar un error.
 */

import api from '../api.js';
import { badge, esc, estadoVacio, fecha, grillaIndicadores, render, tabla } from '../ui.js';

let perfil = null;
let materiaActiva = null;

/** Busca la ficha de profesor correspondiente al usuario de la sesión. */
async function resolverPerfil() {
  if (perfil) return perfil;

  const yo = await api.auth.yo();
  const lista = await api.profesores.listar({ pageSize: 100 });

  const mio = (lista.items ?? []).find((p) => p.userId === yo.usuario.id);
  if (!mio) return null;

  perfil = await api.profesores.obtener(mio.id);
  return perfil;
}

function sinFicha() {
  return `
    <div class="estado estado--vacio">
      <i class="fas fa-id-card" aria-hidden="true"></i>
      <p><strong>Todavía no tenés una ficha de profesor asociada.</strong></p>
      <p>Administración tiene que vincular tu usuario del campus con tu legajo docente.
         Mientras tanto podés seguir usando el resto del panel con normalidad.</p>
    </div>`;
}

function tarjetaMateria(materia) {
  const activa = materiaActiva === materia.id;
  return `
    <button type="button"
            class="tarjeta tarjeta--clicable${activa ? ' tarjeta--activa' : ''}"
            data-materia="${materia.id}"
            aria-pressed="${activa}">
      <p class="tarjeta__titulo">${esc(materia.nombre)}</p>
      <p class="tarjeta__sub">
        ${esc(materia.curso.nivel.nombre)} · ${esc(materia.curso.nombre)} "${esc(materia.curso.division)}"
      </p>
      <p class="tarjeta__sub">
        <i class="fas fa-clock" aria-hidden="true"></i>
        ${esc(materia.cargaHoraria)} h semanales
      </p>
    </button>`;
}

async function listadoAlumnos(materia) {
  const data = await api.alumnos.listar({ cursoId: materia.curso.id, estado: 'ACTIVO', pageSize: 100 });
  const alumnos = data.items ?? [];

  const columnas = [
    { clave: 'legajo', titulo: 'Legajo' },
    { clave: 'alumno', titulo: 'Alumno', render: (a) => `<strong>${esc(a.apellido)}, ${esc(a.nombres)}</strong>` },
    { clave: 'dni', titulo: 'DNI' },
    { clave: 'fechaNacimiento', titulo: 'Nacimiento', render: (a) => fecha(a.fechaNacimiento) },
    { clave: 'contacto', titulo: 'Contacto', render: (a) => `${esc(a.telefono ?? '—')}${a.email ? `<br><small>${esc(a.email)}</small>` : ''}` },
    { clave: 'estado', titulo: 'Estado', render: (a) => badge(a.estado) },
  ];

  return `
    <div class="ficha">
      <h3 class="ficha__titulo">
        <i class="fas fa-users" aria-hidden="true"></i>
        ${esc(materia.nombre)} — ${esc(materia.curso.nombre)} "${esc(materia.curso.division)}"
      </h3>
      ${tabla({
        caption: `Alumnos de ${materia.nombre} en ${materia.curso.nombre} "${materia.curso.division}"`,
        columnas,
        filas: alumnos,
        vacio: 'Este curso todavía no tiene alumnos activos cargados.',
      })}
    </div>`;
}

async function contenido() {
  const p = await resolverPerfil();
  if (!p) return sinFicha();

  const materias = p.profesor?.materias ?? p.materias ?? [];

  if (materias.length === 0) {
    return `
      ${cabecera(p)}
      ${estadoVacio('Todavía no tenés materias asignadas. Administración las asigna desde el panel de gestión.', 'fa-book')}`;
  }

  if (materiaActiva === null) materiaActiva = materias[0].id;
  const materia = materias.find((m) => m.id === materiaActiva) ?? materias[0];

  // Cursos distintos entre todas las materias a cargo.
  const cursos = new Map();
  for (const m of materias) cursos.set(m.curso.id, m.curso);

  return `
    ${cabecera(p, materias.length, cursos.size)}

    <h3 class="subtitulo" id="titulo-materias">Mis materias</h3>
    <div class="grilla-tarjetas" role="group" aria-labelledby="titulo-materias">
      ${materias.map(tarjetaMateria).join('')}
    </div>

    <div id="alumnos-materia" style="margin-top:22px">
      ${await listadoAlumnos(materia)}
    </div>`;
}

function cabecera(p, cantidadMaterias = 0, cantidadCursos = 0) {
  const prof = p.profesor ?? p;
  return `
    <div class="ficha">
      <h3 class="ficha__titulo">
        <i class="fas fa-chalkboard-user" aria-hidden="true"></i>
        ${esc(prof.apellido)}, ${esc(prof.nombres)}
      </h3>
      <dl class="ficha__datos">
        <div><dt>Legajo</dt><dd>${esc(prof.legajo)}</dd></div>
        <div><dt>Especialidad</dt><dd>${esc(prof.especialidad)}</dd></div>
        <div><dt>Estado</dt><dd>${badge(prof.estado)}</dd></div>
        <div><dt>Ingreso</dt><dd>${fecha(prof.fechaIngreso)}</dd></div>
      </dl>
    </div>
    ${grillaIndicadores([
      { titulo: 'Materias a cargo', valor: cantidadMaterias, icono: 'fa-book' },
      { titulo: 'Cursos distintos', valor: cantidadCursos, icono: 'fa-school' },
      { titulo: 'Deportes a cargo', valor: (prof.deportesACargo ?? []).length, icono: 'fa-futbol' },
    ])}`;
}

function engancharEventos(contenedor) {
  contenedor.querySelectorAll('[data-materia]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      materiaActiva = Number(btn.dataset.materia);

      contenedor.querySelectorAll('[data-materia]').forEach((b) => {
        const activa = b === btn;
        b.classList.toggle('tarjeta--activa', activa);
        b.setAttribute('aria-pressed', String(activa));
      });

      const p = await resolverPerfil();
      const materias = p.profesor?.materias ?? p.materias ?? [];
      const materia = materias.find((m) => m.id === materiaActiva);
      if (!materia) return;

      await render('alumnos-materia', () => listadoAlumnos(materia), {
        mensajeCarga: 'Cargando el listado de alumnos…',
      });
    });
  });
}

/** Punto de entrada. Lo llama el panel del docente al abrir la vista. */
export async function iniciarCursosDocente(idContenedor = 'vista-mis-cursos') {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  await render(contenedor, contenido, { mensajeCarga: 'Cargando tus materias y cursos…' });
  engancharEventos(contenedor);
}

export default { iniciarCursosDocente };
