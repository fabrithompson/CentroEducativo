/**
 * Administración de deportes, servicios y aranceles.
 *
 * Cubre lo que la consigna le da al administrador y no tenía pantalla:
 *   - Parte 2: administrar deportes, horarios, inscripciones, el servicio de
 *     transporte y el de comedor.
 *   - Parte 3: "los administradores solamente pueden especificar el valor de
 *     la cuota, deportes y servicios de transporte y comedor".
 *
 * Cuatro solapas: aranceles (cuota por nivel, deportes, los 4 recorridos y el
 * comedor), deportes (responsable, cupo y grupos por nivel y horario), e
 * inscripciones de un alumno (deportes, transporte y comedor). Ninguna regla se
 * decide acá: el tope de 2 deportes, los choques de horario y los permisos los
 * valida el backend y se muestra su mensaje. Un arancel nuevo rige desde la
 * próxima facturación: las facturas emitidas guardan su precio.
 */

import api from '../api.js';
import {
  avisar,
  badge,
  dia,
  esc,
  hora,
  MESES,
  moneda,
  periodoActual,
  pieDialogo,
  plantillaDialogo,
  render,
  tabla,
  textosDialogo,
} from '../ui.js';

const SOLAPAS = {
  aranceles: { titulo: 'Aranceles', icono: 'fa-tags' },
  deportes: { titulo: 'Deportes y grupos', icono: 'fa-futbol' },
  inscripciones: { titulo: 'Inscripciones de un alumno', icono: 'fa-user-plus' },
};

const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

let solapa = 'aranceles';
let catalogos = { niveles: [], profesores: [] };
let deporteDeGrupos = null;
let alumnoElegido = null;

// ==================================================================
// Utilidades
// ==================================================================

/** Lee un importe argentino: "104.000", "104000,50". */
function leerImporte(texto) {
  const limpio = String(texto ?? '').replace(/\$|\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) return null;
  const valor = Number(limpio.replace(/\./g, '').replace(',', '.'));
  return valor > 0 ? valor : null;
}

function campoImporte(clave, valor, etiqueta) {
  return `
    <form class="acciones-fila" data-arancel="${esc(clave)}" novalidate>
      <label class="sr-only" for="ar-${esc(clave)}">Nuevo valor para ${esc(etiqueta)}</label>
      <input id="ar-${esc(clave)}" name="valor" class="form-input" style="max-width:140px"
             inputmode="decimal" value="${esc(String(valor).replace('.', ','))}">
      <button type="submit" class="btn btn--chico btn--primario">
        <i class="fas fa-floppy-disk" aria-hidden="true"></i> Guardar
      </button>
    </form>`;
}

function periodosContratables() {
  const p = periodoActual();
  return [p, p.mes === 12 ? { anio: p.anio + 1, mes: 1 } : { anio: p.anio, mes: p.mes + 1 }];
}

async function ejecutar(boton, accion, despues) {
  if (boton) boton.disabled = true;
  try {
    const r = await accion();
    avisar(r?.mensaje ?? 'Listo.', 'ok');
    await despues();
  } catch (err) {
    avisar(err?.message ?? 'No se pudo completar la operación.', 'error');
    if (boton) boton.disabled = false;
  }
}

// ==================================================================
// Solapa: aranceles
// ==================================================================

async function solapaAranceles() {
  const p = periodoActual();
  const [{ niveles }, { deportes }, { recorridos }, { planes }] = await Promise.all([
    api.academico.niveles(),
    api.deportes.catalogo(),
    api.servicios.recorridos(p),
    api.servicios.planesComedor(p),
  ]);

  return `
    <p class="subtitulo">Un valor nuevo rige desde la próxima facturación. Las facturas ya emitidas conservan su precio.</p>

    <h3 class="ficha__titulo"><i class="fas fa-school" aria-hidden="true"></i> Cuota escolar por nivel</h3>
    ${tabla({
      caption: 'Cuota mensual de cada nivel',
      columnas: [
        { clave: 'nombre', titulo: 'Nivel', render: (n) => `<strong>${esc(n.nombre)}</strong>` },
        { clave: 'actual', titulo: 'Cuota actual', alinear: 'derecha', render: (n) => moneda(n.cuotaMensual) },
        { clave: 'nueva', titulo: 'Cambiar', render: (n) => campoImporte(`nivel-${n.id}`, Number(n.cuotaMensual), `la cuota de ${n.nombre}`) },
      ],
      filas: niveles.filter((n) => n.activo).sort((a, b) => a.orden - b.orden),
    })}

    <h3 class="ficha__titulo" style="margin-top:24px"><i class="fas fa-futbol" aria-hidden="true"></i> Deportes</h3>
    ${tabla({
      caption: 'Arancel mensual de cada deporte',
      columnas: [
        { clave: 'nombre', titulo: 'Deporte', render: (d) => `<strong>${esc(d.nombre)}</strong>` },
        { clave: 'actual', titulo: 'Arancel actual', alinear: 'derecha', render: (d) => moneda(d.arancelMensual) },
        { clave: 'nueva', titulo: 'Cambiar', render: (d) => campoImporte(`deporte-${d.id}`, d.arancelMensual, d.nombre) },
      ],
      filas: deportes.filter((d) => d.activo),
    })}

    <h3 class="ficha__titulo" style="margin-top:24px"><i class="fas fa-bus" aria-hidden="true"></i> Transporte (4 recorridos)</h3>
    ${tabla({
      caption: 'Arancel mensual de cada recorrido',
      columnas: [
        { clave: 'codigo', titulo: 'Recorrido', render: (r) => `<strong>${esc(r.codigo)}</strong> · ${esc(r.nombre)}<br><small>${esc(r.zonas)}</small>` },
        { clave: 'horario', titulo: 'Sale / regresa', render: (r) => `${esc(r.horaSalidaTexto)} / ${esc(r.horaRegresoTexto)}` },
        { clave: 'actual', titulo: 'Arancel actual', alinear: 'derecha', render: (r) => moneda(r.arancelMensual) },
        { clave: 'nueva', titulo: 'Cambiar', render: (r) => campoImporte(`recorrido-${r.id}`, r.arancelMensual, r.nombre) },
      ],
      filas: recorridos,
    })}

    <h3 class="ficha__titulo" style="margin-top:24px"><i class="fas fa-utensils" aria-hidden="true"></i> Comedor</h3>
    ${tabla({
      caption: 'Arancel mensual de cada plan de comedor',
      columnas: [
        { clave: 'nombre', titulo: 'Plan', render: (c) => `<strong>${esc(c.nombre)}</strong>` },
        { clave: 'horario', titulo: 'Horario', render: (c) => esc(c.horaServicioTexto ?? '—') },
        { clave: 'actual', titulo: 'Arancel actual', alinear: 'derecha', render: (c) => moneda(c.arancelMensual) },
        { clave: 'nueva', titulo: 'Cambiar', render: (c) => campoImporte(`comedor-${c.id}`, c.arancelMensual, c.nombre) },
      ],
      filas: planes,
    })}`;
}

const GUARDAR_ARANCEL = {
  nivel: (id, v) => api.academico.actualizarNivel(id, { cuotaMensual: v }),
  deporte: (id, v) => api.deportes.actualizar(id, { arancelMensual: v }),
  recorrido: (id, v) => api.servicios.arancelRecorrido(id, v),
  comedor: (id, v) => api.servicios.arancelComedor(id, v),
};

function cablearAranceles(panel) {
  panel.querySelectorAll('form[data-arancel]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const [tipo, id] = form.dataset.arancel.split('-');
      const valor = leerImporte(new FormData(form).get('valor'));
      if (valor === null) {
        avisar('Escribí un importe mayor que cero, por ejemplo 104.000 o 104000,50.', 'error');
        return;
      }
      ejecutar(form.querySelector('button'), () => GUARDAR_ARANCEL[tipo](Number(id), valor), pintar);
    });
  });
}

// ==================================================================
// Solapa: deportes y grupos
// ==================================================================

function opcionesProfesores(seleccionado) {
  return catalogos.profesores
    .map((p) => `<option value="${p.id}"${p.id === seleccionado ? ' selected' : ''}>${esc(p.apellido)}, ${esc(p.nombres)}</option>`)
    .join('');
}

async function solapaDeportes() {
  const { deportes } = await api.deportes.catalogo();

  return `
    ${tabla({
      caption: 'Deportes del colegio',
      columnas: [
        { clave: 'nombre', titulo: 'Deporte', render: (d) => `<strong>${esc(d.nombre)}</strong><br><small>${esc(d.descripcion ?? '')}</small>` },
        {
          clave: 'responsable', titulo: 'Profesor responsable',
          render: (d) => `
            <label class="sr-only" for="resp-${d.id}">Profesor responsable de ${esc(d.nombre)}</label>
            <select id="resp-${d.id}" class="form-select" data-responsable="${d.id}">
              ${opcionesProfesores(d.profesorResponsable?.id)}
            </select>`,
        },
        { clave: 'inscriptos', titulo: 'Inscriptos', alinear: 'centro', render: (d) => `${esc(d.inscriptos)} / ${esc(d.cupoMaximo)}` },
        {
          clave: 'grupos', titulo: 'Grupos',
          render: (d) =>
            d.horarios.length
              ? d.horarios.map((h) => `${esc(h.nivel?.nombre ?? '')}: ${esc(dia(h.diaSemana))} ${esc(h.horaInicioTexto ?? hora(h.horaInicio))}`).join('<br>')
              : '<span class="badge badge--espera">sin grupos</span>',
        },
        { clave: 'activo', titulo: 'Estado', alinear: 'centro', render: (d) => badge(d.activo ? 'ACTIVO' : 'INACTIVO') },
        {
          clave: 'acciones', titulo: 'Acciones',
          render: (d) => `
            <div class="acciones-fila">
              <button type="button" class="btn btn--chico btn--suave" data-grupos="${d.id}" data-nombre="${esc(d.nombre)}">
                <i class="fas fa-clock" aria-hidden="true"></i> Grupos
              </button>
              <button type="button" class="btn btn--chico ${d.activo ? 'btn--peligro' : 'btn--ok'}" data-activo="${d.id}" data-valor="${d.activo ? 'false' : 'true'}">
                <i class="fas ${d.activo ? 'fa-ban' : 'fa-rotate-left'}" aria-hidden="true"></i> ${d.activo ? 'Desactivar' : 'Reactivar'}
              </button>
            </div>`,
        },
      ],
      filas: deportes,
    })}

    <form class="ficha" id="form-nuevo-deporte" novalidate style="margin-top:24px">
      <h3 class="ficha__titulo"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo deporte</h3>
      <div class="form-grid-2">
        <div class="form-group"><label for="nd-nombre">Nombre</label><input id="nd-nombre" name="nombre" class="form-input" required minlength="2" maxlength="80"></div>
        <div class="form-group"><label for="nd-resp">Profesor responsable</label><select id="nd-resp" name="profesorResponsableId" class="form-select" required>${opcionesProfesores(null)}</select></div>
        <div class="form-group"><label for="nd-arancel">Arancel mensual</label><input id="nd-arancel" name="arancelMensual" class="form-input" inputmode="decimal" required></div>
        <div class="form-group"><label for="nd-cupo">Cupo por grupo</label><input id="nd-cupo" name="cupoMaximo" type="number" min="1" max="200" value="25" class="form-input"></div>
      </div>
      <div class="form-group"><label for="nd-desc">Descripción</label><input id="nd-desc" name="descripcion" class="form-input" maxlength="500"></div>
      <button type="submit" class="btn btn--primario"><i class="fas fa-plus" aria-hidden="true"></i> Crear deporte</button>
    </form>`;
}

function dialogoGrupos() {
  return plantillaDialogo({
    id: 'dlg-grupos',
    icono: 'fa-clock',
    titulo: 'Grupos del deporte',
    cuerpo: `
      <div id="gr-lista" aria-live="polite"></div>
      <form id="form-grupo" novalidate>
        <div class="form-grid-2">
          <div class="form-group">
            <label for="gr-nivel">Nivel</label>
            <select id="gr-nivel" name="nivelId" class="form-select" required>
              ${catalogos.niveles.map((n) => `<option value="${n.id}">${esc(n.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="gr-dia">Día</label>
            <select id="gr-dia" name="diaSemana" class="form-select" required>
              ${DIAS_SEMANA.map((d) => `<option value="${d}">${esc(dia(d))}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label for="gr-desde">Desde</label><input id="gr-desde" name="horaInicio" type="time" class="form-input" value="17:00" required></div>
          <div class="form-group"><label for="gr-hasta">Hasta</label><input id="gr-hasta" name="horaFin" type="time" class="form-input" value="18:30" required></div>
        </div>
        <div class="form-group"><label for="gr-lugar">Lugar</label><input id="gr-lugar" name="lugar" class="form-input" maxlength="120" placeholder="Polideportivo del colegio"></div>
        <p class="campo__error" id="gr-error" role="alert" hidden></p>
        ${pieDialogo({ textoGuardar: 'Agregar grupo', iconoGuardar: 'fa-plus', idGuardar: 'gr-guardar' })}
      </form>`,
  });
}

async function pintarGrupos() {
  const lista = document.getElementById('gr-lista');
  if (!lista || deporteDeGrupos === null) return;
  const { deporte } = await api.deportes.obtener(deporteDeGrupos);
  const horarios = deporte.horarios ?? [];
  lista.innerHTML = horarios.length
    ? `<ul class="lista-horarios">${horarios
        .map(
          (h) => `<li>
            <span>${esc(h.nivel?.nombre ?? '')} · ${esc(dia(h.diaSemana))}</span>
            <span>${esc(h.horaInicioTexto ?? hora(h.horaInicio))}–${esc(h.horaFinTexto ?? hora(h.horaFin))} · ${esc(h.lugar)}</span>
            <button type="button" class="btn btn--chico btn--peligro" data-quitar-grupo="${h.id}" aria-label="Quitar este grupo">
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </li>`,
        )
        .join('')}</ul>`
    : '<p>Todavía no tiene grupos. Sin grupos, nadie se puede inscribir.</p>';

  lista.querySelectorAll('[data-quitar-grupo]').forEach((b) => {
    b.addEventListener('click', () =>
      ejecutar(b, () => api.deportes.quitarHorario(deporteDeGrupos, Number(b.dataset.quitarGrupo)), async () => {
        await pintarGrupos();
        await pintar();
      }),
    );
  });
}

function cablearDeportes(panel) {
  panel.querySelectorAll('[data-responsable]').forEach((sel) => {
    sel.addEventListener('change', () =>
      ejecutar(null, () => api.deportes.actualizar(Number(sel.dataset.responsable), { profesorResponsableId: Number(sel.value) }), pintar),
    );
  });

  panel.querySelectorAll('[data-activo]').forEach((b) => {
    b.addEventListener('click', () =>
      ejecutar(b, () => api.deportes.actualizar(Number(b.dataset.activo), { activo: b.dataset.valor === 'true' }), pintar),
    );
  });

  panel.querySelectorAll('[data-grupos]').forEach((b) => {
    b.addEventListener('click', async () => {
      deporteDeGrupos = Number(b.dataset.grupos);
      const dlg = document.getElementById('dlg-grupos');
      textosDialogo(dlg, { titulo: 'Grupos por nivel y horario', subtitulo: b.dataset.nombre });
      document.getElementById('gr-error').hidden = true;
      await pintarGrupos();
      window.abrirDialogo(dlg, { foco: '#gr-nivel' });
    });
  });

  const form = panel.querySelector('#form-nuevo-deporte');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const arancel = leerImporte(d.arancelMensual);
    if (arancel === null) {
      avisar('El arancel tiene que ser un importe mayor que cero.', 'error');
      return;
    }
    ejecutar(
      form.querySelector('button[type=submit]'),
      () =>
        api.deportes.crear({
          nombre: d.nombre,
          descripcion: d.descripcion || null,
          profesorResponsableId: Number(d.profesorResponsableId),
          arancelMensual: arancel,
          cupoMaximo: Number(d.cupoMaximo || 25),
        }),
      pintar,
    );
  });
}

async function agregarGrupo(e) {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(e.currentTarget));
  const error = document.getElementById('gr-error');
  error.hidden = true;
  try {
    const r = await api.deportes.agregarHorario(deporteDeGrupos, {
      nivelId: Number(datos.nivelId),
      diaSemana: datos.diaSemana,
      horaInicio: datos.horaInicio,
      horaFin: datos.horaFin,
      ...(datos.lugar ? { lugar: datos.lugar } : {}),
    });
    avisar(r.mensaje, 'ok');
    await pintarGrupos();
    await pintar();
  } catch (err) {
    error.textContent = err?.message ?? 'No se pudo agregar el grupo.';
    error.hidden = false;
  }
}

// ==================================================================
// Solapa: inscripciones de un alumno
// ==================================================================

async function solapaInscripciones() {
  const buscador = `
    <form class="acciones-fila" id="form-buscar-alumno" role="search" novalidate>
      <label class="sr-only" for="ins-busqueda">Buscar alumno por legajo, DNI o apellido</label>
      <input id="ins-busqueda" name="busqueda" class="form-input" placeholder="Legajo, DNI o apellido" style="max-width:320px">
      <button type="submit" class="btn btn--primario"><i class="fas fa-magnifying-glass" aria-hidden="true"></i> Buscar</button>
    </form>
    <div id="ins-resultados"></div>`;

  if (!alumnoElegido) return buscador;

  const p = periodoActual();
  const [inscriptos, disponibles, servicios, { recorridos }, { planes }] = await Promise.all([
    api.deportes.deAlumno(alumnoElegido.id),
    api.deportes.disponiblesPara(alumnoElegido.id),
    api.servicios.deAlumno(alumnoElegido.id, p),
    api.servicios.recorridos(p),
    api.servicios.planesComedor(p),
  ]);
  const yaCursa = new Set((inscriptos.inscripciones ?? inscriptos.deportes ?? []).map((i) => i.deporte?.id ?? i.deporteId));
  const listaInscriptos = inscriptos.inscripciones ?? inscriptos.deportes ?? [];
  const periodos = periodosContratables()
    .map((x) => `<option value="${x.anio}-${x.mes}">${esc(MESES[x.mes - 1])} ${x.anio}</option>`)
    .join('');

  return `
    ${buscador}
    <div class="ficha">
      <h3 class="ficha__titulo"><i class="fas fa-user" aria-hidden="true"></i>
        ${esc(alumnoElegido.apellido)}, ${esc(alumnoElegido.nombres)} · Legajo ${esc(alumnoElegido.legajo)}
      </h3>

      <h4>Deportes (máximo 2, sin choques de horario)</h4>
      <ul class="lista-horarios">
        ${listaInscriptos.length
          ? listaInscriptos
              .map(
                (i) => `<li><span>${esc(i.deporte.nombre)}</span>
                  <button type="button" class="btn btn--chico btn--suave" data-baja-dep="${i.id ?? i.inscripcionId}">Dar de baja</button></li>`,
              )
              .join('')
          : '<li><span>No cursa deportes.</span></li>'}
      </ul>
      <div class="acciones-fila">
        <label class="sr-only" for="ins-deporte">Deporte para inscribir</label>
        <select id="ins-deporte" class="form-select">
          ${disponibles.deportes
            .filter((d) => !yaCursa.has(d.id))
            .map((d) => `<option value="${d.id}"${d.inscribible ? '' : ' disabled'}>${esc(d.nombre)}${d.inscribible ? '' : ` — ${esc(d.motivo)}`}</option>`)
            .join('')}
        </select>
        <button type="button" class="btn btn--chico btn--primario" id="btn-inscribir-dep">Inscribir</button>
      </div>

      <h4 style="margin-top:20px">Transporte</h4>
      ${servicios.transporte && servicios.transporte.estado === 'ACTIVA'
        ? `<p>${esc(servicios.transporte.recorrido.codigo)} · ${esc(servicios.transporte.recorrido.nombre)} (${badge(servicios.transporte.turno)})
             <button type="button" class="btn btn--chico btn--suave" data-baja-tr="${servicios.transporte.id}">Dar de baja</button></p>`
        : `<form class="acciones-fila" id="form-ins-tr" novalidate>
             <select name="recorridoId" class="form-select" aria-label="Recorrido">${recorridos.map((r) => `<option value="${r.id}">${esc(r.codigo)} · ${esc(r.nombre)}</option>`).join('')}</select>
             <select name="turno" class="form-select" aria-label="Turno"><option value="IDA_Y_VUELTA">Ida y vuelta</option><option value="IDA">Sólo ida</option><option value="VUELTA">Sólo vuelta</option></select>
             <select name="periodo" class="form-select" aria-label="Mes">${periodos}</select>
             <button type="submit" class="btn btn--chico btn--primario">Contratar</button>
           </form>`}

      <h4 style="margin-top:20px">Comedor</h4>
      ${servicios.comedor && servicios.comedor.estado === 'ACTIVA'
        ? `<p>${esc(servicios.comedor.comedor.nombre)}
             <button type="button" class="btn btn--chico btn--suave" data-baja-co="${servicios.comedor.id}">Dar de baja</button></p>`
        : `<form class="acciones-fila" id="form-ins-co" novalidate>
             <select name="comedorId" class="form-select" aria-label="Plan de comedor">${planes.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
             <select name="periodo" class="form-select" aria-label="Mes">${periodos}</select>
             <button type="submit" class="btn btn--chico btn--primario">Contratar</button>
           </form>`}
    </div>`;
}

function leerPeriodo(form) {
  const [anio, mes] = String(new FormData(form).get('periodo')).split('-').map(Number);
  return { anio, mes };
}

function cablearInscripciones(panel) {
  const buscar = panel.querySelector('#form-buscar-alumno');
  buscar?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const busqueda = String(new FormData(buscar).get('busqueda') ?? '').trim();
    if (!busqueda) return;
    const destino = panel.querySelector('#ins-resultados');
    try {
      const { items } = await api.alumnos.listar({ busqueda, pageSize: 10 });
      destino.innerHTML = items.length
        ? `<ul class="lista-horarios">${items
            .map(
              (a) => `<li><span>${esc(a.apellido)}, ${esc(a.nombres)} · ${esc(a.legajo)}</span>
                <button type="button" class="btn btn--chico btn--suave" data-elegir="${a.id}">Elegir</button></li>`,
            )
            .join('')}</ul>`
        : '<p>No se encontraron alumnos.</p>';
      destino.querySelectorAll('[data-elegir]').forEach((b) => {
        b.addEventListener('click', () => {
          alumnoElegido = items.find((a) => a.id === Number(b.dataset.elegir));
          pintar();
        });
      });
    } catch (err) {
      avisar(err?.message ?? 'No se pudo buscar.', 'error');
    }
  });

  if (!alumnoElegido) return;
  const id = alumnoElegido.id;

  panel.querySelector('#btn-inscribir-dep')?.addEventListener('click', (e) => {
    const deporteId = Number(panel.querySelector('#ins-deporte')?.value);
    if (!deporteId) return;
    ejecutar(e.currentTarget, () => api.deportes.inscribir(id, deporteId), pintar);
  });
  panel.querySelectorAll('[data-baja-dep]').forEach((b) =>
    b.addEventListener('click', () => ejecutar(b, () => api.deportes.darDeBaja(Number(b.dataset.bajaDep)), pintar)),
  );
  panel.querySelectorAll('[data-baja-tr]').forEach((b) =>
    b.addEventListener('click', () => ejecutar(b, () => api.servicios.bajaTransporte(Number(b.dataset.bajaTr)), pintar)),
  );
  panel.querySelectorAll('[data-baja-co]').forEach((b) =>
    b.addEventListener('click', () => ejecutar(b, () => api.servicios.bajaComedor(Number(b.dataset.bajaCo)), pintar)),
  );

  const formTr = panel.querySelector('#form-ins-tr');
  formTr?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(formTr);
    ejecutar(
      formTr.querySelector('button'),
      () => api.servicios.contratarTransporte({ alumnoId: id, recorridoId: Number(d.get('recorridoId')), turno: d.get('turno'), ...leerPeriodo(formTr) }),
      pintar,
    );
  });

  const formCo = panel.querySelector('#form-ins-co');
  formCo?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(formCo);
    ejecutar(
      formCo.querySelector('button'),
      () => api.servicios.contratarComedor({ alumnoId: id, comedorId: Number(d.get('comedorId')), ...leerPeriodo(formCo) }),
      pintar,
    );
  });
}

// ==================================================================
// Armado de la vista
// ==================================================================

const CONTENIDO = { aranceles: solapaAranceles, deportes: solapaDeportes, inscripciones: solapaInscripciones };
const CABLEADO = { aranceles: cablearAranceles, deportes: cablearDeportes, inscripciones: cablearInscripciones };

async function pintar() {
  const panel = document.getElementById('panel-servicios');
  if (!panel) return;
  await render(panel, CONTENIDO[solapa], { mensajeCarga: 'Cargando…' });
  CABLEADO[solapa](panel);
}

function pestanias() {
  return `
    <div class="pestanias" role="tablist" aria-label="Deportes, servicios y aranceles">
      ${Object.entries(SOLAPAS)
        .map(
          ([clave, s]) => `
        <button type="button" role="tab" id="tab-sv-${clave}" aria-selected="${clave === solapa}"
                aria-controls="panel-servicios" data-solapa-sv="${clave}"
                class="pestania${clave === solapa ? ' pestania--activa' : ''}">
          <i class="fas ${s.icono}" aria-hidden="true"></i> ${esc(s.titulo)}
        </button>`,
        )
        .join('')}
    </div>`;
}

export async function iniciarAdminServicios(id) {
  const contenedor = document.getElementById(id);
  if (!contenedor) return;

  await render(contenedor, async () => {
    const [{ niveles }, profesores] = await Promise.all([
      api.academico.niveles(),
      api.profesores.listar({ estado: 'ACTIVO', pageSize: 100 }),
    ]);
    catalogos = {
      niveles: niveles.filter((n) => n.activo).sort((a, b) => a.orden - b.orden),
      profesores: profesores.items ?? [],
    };
    return `
      <p class="subtitulo">
        Deportes con su profesor responsable y sus grupos por nivel y horario, los 4 recorridos de
        transporte, el comedor, los aranceles de cada uno y las inscripciones de cada alumno.
      </p>
      ${pestanias()}
      <div id="panel-servicios" role="tabpanel" aria-labelledby="tab-sv-${solapa}" tabindex="0"></div>
      ${dialogoGrupos()}`;
  });

  contenedor.querySelectorAll('[data-solapa-sv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      solapa = btn.dataset.solapaSv;
      contenedor.querySelectorAll('[data-solapa-sv]').forEach((b) => {
        const activa = b === btn;
        b.classList.toggle('pestania--activa', activa);
        b.setAttribute('aria-selected', String(activa));
      });
      document.getElementById('panel-servicios').setAttribute('aria-labelledby', `tab-sv-${solapa}`);
      await pintar();
    });
  });

  document.getElementById('form-grupo')?.addEventListener('submit', agregarGrupo);

  await pintar();
}

export default { iniciarAdminServicios };
