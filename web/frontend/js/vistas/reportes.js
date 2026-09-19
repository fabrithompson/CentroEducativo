/**
 * Reportes administrativos.
 *
 * Seis reportes con filtros por fecha, curso, nivel, recorrido, deporte,
 * materia y docente. Cada uno se arma con los mismos componentes de `ui.js`,
 * así que tienen el mismo aspecto y todos exportan a CSV con el mismo botón.
 *
 * Los catálogos (cursos, niveles, deportes, profesores) se cargan una vez y se
 * cachean: sin eso, cambiar de pestaña volvería a pedirlos cada vez.
 */

import api from '../api.js';
import {
  MESES,
  badge,
  dia,
  esc,
  estadoVacio,
  exportarCSV,
  fecha,
  filtros,
  grillaIndicadores,
  leerFiltros,
  moneda,
  periodoActual,
  render,
  tabla,
} from '../ui.js';

// ==================================================================
// Catálogos
// ==================================================================

let catalogos = null;

async function cargarCatalogos() {
  if (catalogos) return catalogos;

  // Si alguno falla, el reporte igual tiene que poder mostrarse: los filtros
  // que dependan de ese catálogo quedan vacíos, no se rompe la pantalla.
  const [deportes, recorridos, profesores, materias] = await Promise.allSettled([
    api.deportes.catalogo(),
    api.servicios.recorridos(periodoActual()),
    api.profesores.listar({ pageSize: 100 }),
    // No hay endpoint de catálogo de materias. El resumen del reporte RF-06 sin
    // filtrar ya trae todas —incluidas las que no tienen inscriptos, que son
    // justamente las que la Dirección necesita ver— así que se usa como
    // catálogo en vez de agregar una ruta nueva al backend.
    api.reportes.alumnosPorMateria({}),
  ]);

  catalogos = {
    deportes: deportes.status === 'fulfilled' ? (deportes.value.deportes ?? []) : [],
    recorridos: recorridos.status === 'fulfilled' ? (recorridos.value.recorridos ?? []) : [],
    profesores: profesores.status === 'fulfilled' ? (profesores.value.items ?? []) : [],
    materias: materias.status === 'fulfilled' ? (materias.value.resumenPorMateria ?? []) : [],
  };

  return catalogos;
}

const opcion = (valor, texto) => ({ valor, texto });

const opcionesNivel = () => [
  opcion('', 'Todos los niveles'),
  opcion('1', 'Inicial'),
  opcion('2', 'Primario'),
  opcion('3', 'Secundario'),
];

const opcionesAnio = () => {
  const actual = new Date().getFullYear();
  return [actual, actual - 1, actual - 2].map((a) => opcion(String(a), String(a)));
};

const opcionesMes = () => [
  opcion('', 'Todos los meses'),
  ...MESES.map((m, i) => opcion(String(i + 1), m)),
];

// ==================================================================
// Reporte 1 — Alumnos por deporte / nivel / horario / docente
// ==================================================================

async function reporteDeportes(contenedor, valores = {}) {
  const cat = await cargarCatalogos();

  const barra = filtros({
    id: 'f-deportes',
    campos: [
      {
        nombre: 'deporteId', etiqueta: 'Deporte', tipo: 'select', valor: valores.deporteId,
        opciones: [opcion('', 'Todos'), ...cat.deportes.map((d) => opcion(String(d.id), d.nombre))],
      },
      { nombre: 'nivelId', etiqueta: 'Nivel', tipo: 'select', valor: valores.nivelId, opciones: opcionesNivel() },
      {
        nombre: 'diaSemana', etiqueta: 'Día', tipo: 'select', valor: valores.diaSemana,
        opciones: [
          opcion('', 'Todos los días'),
          ...['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'].map((d) => opcion(d, dia(d))),
        ],
      },
      {
        nombre: 'profesorId', etiqueta: 'Docente a cargo', tipo: 'select', valor: valores.profesorId,
        opciones: [
          opcion('', 'Todos'),
          ...cat.profesores.map((p) => opcion(String(p.id), `${p.apellido}, ${p.nombres}`)),
        ],
      },
    ],
  });

  const data = await api.reportes.alumnosPorDeporte(valores);

  const columnas = [
    { clave: 'legajo', titulo: 'Legajo', render: (f) => esc(f.alumno.legajo) },
    { clave: 'alumno', titulo: 'Alumno', render: (f) => `${esc(f.alumno.apellido)}, ${esc(f.alumno.nombres)}` },
    { clave: 'curso', titulo: 'Curso', render: (f) => esc(f.alumno.curso) },
    { clave: 'nivel', titulo: 'Nivel', render: (f) => esc(f.alumno.nivel) },
    { clave: 'deporte', titulo: 'Deporte', render: (f) => esc(f.deporte.nombre) },
    {
      clave: 'docente', titulo: 'Docente',
      render: (f) => esc(`${f.deporte.profesorResponsable.apellido}, ${f.deporte.profesorResponsable.nombres}`),
    },
    {
      clave: 'horarios', titulo: 'Horarios',
      render: (f) =>
        f.horarios.length === 0
          ? '—'
          : `<ul class="lista-horarios">${f.horarios
              .map((h) => `<li><span>${esc(dia(h.diaSemana))}</span><span>${esc(h.desde)}–${esc(h.hasta)}</span></li>`)
              .join('')}</ul>`,
    },
    { clave: 'arancel', titulo: 'Arancel', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.deporte.arancelMensual)}</span>` },
  ];

  const resumen = data.resumenPorDeporte.length
    ? tabla({
        caption: 'Totales por deporte',
        columnas: [
          { clave: 'deporte', titulo: 'Deporte' },
          { clave: 'alumnos', titulo: 'Alumnos', alinear: 'derecha' },
          { clave: 'recaudacion', titulo: 'Recaudación mensual', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.recaudacionMensual)}</span>` },
        ],
        filas: data.resumenPorDeporte,
      })
    : '';

  guardarExportacion('alumnos-por-deporte', columnas, data.filas, (f) => ({
    Legajo: f.alumno.legajo,
    Alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
    Curso: f.alumno.curso,
    Nivel: f.alumno.nivel,
    Deporte: f.deporte.nombre,
    Docente: `${f.deporte.profesorResponsable.apellido}, ${f.deporte.profesorResponsable.nombres}`,
    Horarios: f.horarios.map((h) => `${dia(h.diaSemana)} ${h.desde}-${h.hasta}`).join(' | '),
    Arancel: f.deporte.arancelMensual,
  }));

  return `
    ${barra}
    ${grillaIndicadores([
      { titulo: 'Inscripciones', valor: data.totales.inscripciones, icono: 'fa-clipboard-list' },
      { titulo: 'Alumnos distintos', valor: data.totales.alumnosDistintos, icono: 'fa-users' },
      { titulo: 'Recaudación mensual', valor: moneda(data.totales.recaudacionMensual), tono: 'ok', icono: 'fa-coins' },
    ])}
    ${botonExportar()}
    ${tabla({ caption: 'Alumnos inscriptos en actividades deportivas', columnas, filas: data.filas, vacio: 'Ningún alumno coincide con los filtros aplicados.' })}
    ${resumen ? `<div class="ficha" style="margin-top:20px">${resumen}</div>` : ''}`;
}

// ==================================================================
// Reporte 2 — Alumnos por materia (RF-06)
// ==================================================================

async function reporteMaterias(contenedor, valores = {}) {
  const cat = await cargarCatalogos();

  const barra = filtros({
    id: 'f-materias',
    campos: [
      {
        nombre: 'materiaId', etiqueta: 'Materia', tipo: 'select', valor: valores.materiaId,
        opciones: [
          opcion('', 'Todas'),
          ...cat.materias.map((m) => opcion(String(m.materiaId), `${m.curso} — ${m.materia}`)),
        ],
      },
      { nombre: 'nivelId', etiqueta: 'Nivel', tipo: 'select', valor: valores.nivelId, opciones: opcionesNivel() },
      {
        nombre: 'profesorId', etiqueta: 'Docente a cargo', tipo: 'select', valor: valores.profesorId,
        opciones: [
          opcion('', 'Todos'),
          ...cat.profesores.map((p) => opcion(String(p.id), `${p.apellido}, ${p.nombres}`)),
        ],
      },
    ],
  });

  const data = await api.reportes.alumnosPorMateria(valores);

  const columnas = [
    { clave: 'nivel', titulo: 'Nivel' },
    { clave: 'curso', titulo: 'Curso' },
    { clave: 'materia', titulo: 'Materia' },
    {
      clave: 'profesor', titulo: 'Profesor a cargo',
      render: (f) =>
        f.profesor === 'Sin docente asignado'
          ? '<em>Sin docente asignado</em>'
          : esc(f.profesor),
    },
    { clave: 'alumno', titulo: 'Alumno' },
    { clave: 'legajo', titulo: 'Legajo' },
  ];

  const resumen = data.resumenPorMateria.length
    ? tabla({
        caption: 'Inscriptos por materia',
        columnas: [
          { clave: 'curso', titulo: 'Curso' },
          { clave: 'materia', titulo: 'Materia' },
          { clave: 'profesor', titulo: 'Profesor a cargo' },
          {
            clave: 'leyenda', titulo: 'Inscriptos', alinear: 'derecha',
            // HU6 pide que una materia sin inscriptos se informe como tal y no
            // desaparezca de la vista: son las que la Dirección busca detectar.
            render: (f) =>
              f.inscriptos === 0
                ? `<span class="badge badge--alerta">${esc(f.leyenda)}</span>`
                : `<span class="numero">${esc(f.leyenda)}</span>`,
          },
        ],
        filas: data.resumenPorMateria,
      })
    : '';

  // El detalle sólo tiene pares (materia, alumno), así que una materia sin
  // inscriptos no aparece en ninguna de sus filas. Para la exportación se
  // reconstruye desde el resumen: cada materia aporta sus alumnos o, si no
  // tiene, una única fila que lo dice. Sin esto el CSV que baja la Dirección
  // omitiría justamente el dato que pide el criterio de aceptación.
  const filasPorMateria = new Map();
  for (const fila of data.filas) {
    const acumuladas = filasPorMateria.get(fila.materiaId);
    if (acumuladas) acumuladas.push(fila);
    else filasPorMateria.set(fila.materiaId, [fila]);
  }

  const filasExport = data.resumenPorMateria.flatMap((m) =>
    filasPorMateria.get(m.materiaId) ?? [{
      nivel: m.nivel,
      curso: m.curso,
      materia: m.materia,
      profesor: m.profesor,
      alumno: m.leyenda,
      legajo: '',
      dni: '',
    }],
  );

  guardarExportacion('alumnos-por-materia', columnas, filasExport, (f) => ({
    Nivel: f.nivel,
    Curso: f.curso,
    Materia: f.materia,
    Profesor: f.profesor,
    Alumno: f.alumno,
    Legajo: f.legajo,
    DNI: f.dni,
  }));

  return `
    ${barra}
    ${grillaIndicadores([
      { titulo: 'Materias', valor: data.totales.materias, icono: 'fa-book' },
      { titulo: 'Alumnos distintos', valor: data.totales.alumnosDistintos, icono: 'fa-users' },
      { titulo: 'Inscripciones', valor: data.totales.filas, icono: 'fa-clipboard-list' },
      {
        titulo: 'Materias sin inscriptos',
        valor: data.totales.materiasSinInscriptos,
        tono: data.totales.materiasSinInscriptos > 0 ? 'alerta' : 'ok',
        icono: 'fa-circle-exclamation',
      },
      {
        titulo: 'Materias sin docente',
        valor: data.totales.materiasSinDocente,
        tono: data.totales.materiasSinDocente > 0 ? 'alerta' : 'ok',
        icono: 'fa-user-slash',
      },
    ])}
    ${botonExportar()}
    ${tabla({ caption: 'Alumnos por materia', columnas, filas: data.filas, vacio: 'Ninguna materia con inscriptos coincide con los filtros aplicados.' })}
    ${resumen ? `<div class="ficha" style="margin-top:20px">${resumen}</div>` : ''}`;
}

// ==================================================================
// Reporte 3 — Alumnos por recorrido de transporte
// ==================================================================

async function reporteTransporte(contenedor, valores = {}) {
  const cat = await cargarCatalogos();
  const hoy = periodoActual();

  const barra = filtros({
    id: 'f-transporte',
    campos: [
      {
        nombre: 'codigo', etiqueta: 'Recorrido', tipo: 'select', valor: valores.codigo,
        opciones: [
          opcion('', 'Los 4 recorridos'),
          ...cat.recorridos.map((r) => opcion(r.codigo, `${r.codigo} — ${r.nombre}`)),
        ],
      },
      { nombre: 'anio', etiqueta: 'Año', tipo: 'select', valor: valores.anio ?? String(hoy.anio), opciones: opcionesAnio() },
      {
        nombre: 'mes', etiqueta: 'Mes', tipo: 'select', valor: valores.mes ?? String(hoy.mes),
        opciones: MESES.map((m, i) => opcion(String(i + 1), m)),
      },
    ],
  });

  const data = await api.reportes.alumnosPorTransporte({
    anio: valores.anio ?? hoy.anio,
    mes: valores.mes ?? hoy.mes,
    codigo: valores.codigo,
  });

  const columnas = [
    { clave: 'codigo', titulo: 'Recorrido', render: (f) => `<strong>${esc(f.recorrido.codigo)}</strong>` },
    { clave: 'legajo', titulo: 'Legajo', render: (f) => esc(f.alumno.legajo) },
    { clave: 'alumno', titulo: 'Alumno', render: (f) => `${esc(f.alumno.apellido)}, ${esc(f.alumno.nombres)}` },
    { clave: 'curso', titulo: 'Curso', render: (f) => esc(f.alumno.curso) },
    { clave: 'domicilio', titulo: 'Domicilio', render: (f) => `${esc(f.alumno.domicilio)}<br><small>${esc(f.alumno.localidad)}</small>` },
    { clave: 'turno', titulo: 'Turno', render: (f) => badge(f.turno) },
    { clave: 'telefono', titulo: 'Teléfono', render: (f) => esc(f.alumno.telefono ?? '—') },
  ];

  const ocupacion = tabla({
    caption: 'Ocupación de los 4 recorridos',
    columnas: [
      { clave: 'codigo', titulo: 'Código' },
      { clave: 'nombre', titulo: 'Recorrido' },
      { clave: 'ocupados', titulo: 'Pasajeros', alinear: 'derecha' },
      { clave: 'capacidad', titulo: 'Capacidad', alinear: 'derecha' },
      {
        clave: 'porcentajeOcupacion', titulo: 'Ocupación', alinear: 'derecha',
        render: (f) => `
          <span class="numero">${esc(f.porcentajeOcupacion)}%</span>
          <div class="progreso" role="img" aria-label="${esc(f.porcentajeOcupacion)}% de ocupación">
            <div class="progreso__barra" style="width:${Math.min(100, f.porcentajeOcupacion)}%"></div>
          </div>`,
      },
      { clave: 'recaudacionMensual', titulo: 'Recaudación', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.recaudacionMensual)}</span>` },
    ],
    filas: data.ocupacionPorRecorrido,
  });

  guardarExportacion('alumnos-por-recorrido', columnas, data.filas, (f) => ({
    Recorrido: f.recorrido.codigo,
    Legajo: f.alumno.legajo,
    Alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
    Curso: f.alumno.curso,
    Domicilio: `${f.alumno.domicilio}, ${f.alumno.localidad}`,
    Turno: f.turno,
    Telefono: f.alumno.telefono ?? '',
  }));

  return `
    ${barra}
    ${grillaIndicadores([
      { titulo: 'Pasajeros', valor: data.totales.pasajeros, icono: 'fa-bus' },
      { titulo: 'Recaudación mensual', valor: moneda(data.totales.recaudacionMensual), tono: 'ok', icono: 'fa-coins' },
    ])}
    <div class="ficha">${ocupacion}</div>
    ${botonExportar()}
    ${tabla({ caption: 'Alumnos por recorrido', columnas, filas: data.filas, vacio: 'No hay alumnos con transporte contratado en ese período.' })}`;
}

// ==================================================================
// Reporte 4 — Pagos completos e incompletos
// ==================================================================

async function reportePagos(contenedor, valores = {}) {
  const barra = filtros({
    id: 'f-pagos',
    campos: [
      { nombre: 'anio', etiqueta: 'Año', tipo: 'select', valor: valores.anio, opciones: [opcion('', 'Todos'), ...opcionesAnio()] },
      { nombre: 'mes', etiqueta: 'Mes', tipo: 'select', valor: valores.mes, opciones: opcionesMes() },
      { nombre: 'nivelId', etiqueta: 'Nivel', tipo: 'select', valor: valores.nivelId, opciones: opcionesNivel() },
      { nombre: 'cursoId', etiqueta: 'ID de curso', tipo: 'number', valor: valores.cursoId, placeholder: 'Opcional' },
    ],
  });

  const data = await api.reportes.pagos(valores);

  const columnas = [
    { clave: 'numero', titulo: 'Comprobante' },
    { clave: 'periodo', titulo: 'Período' },
    { clave: 'alumno', titulo: 'Alumno', render: (f) => `${esc(f.alumno.apellido)}, ${esc(f.alumno.nombres)}<br><small>${esc(f.alumno.curso)}</small>` },
    { clave: 'tutor', titulo: 'Tutor', render: (f) => esc(f.tutor?.nombre ?? 'Sin tutor asignado') },
    { clave: 'total', titulo: 'Total', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.total)}</span>` },
    { clave: 'pagado', titulo: 'Pagado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.pagado)}</span>` },
    { clave: 'saldo', titulo: 'Saldo', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.saldo)}</span>` },
    { clave: 'estado', titulo: 'Estado', render: (f) => badge(f.estado) },
    { clave: 'vencimiento', titulo: 'Vence', render: (f) => fecha(f.fechaVencimiento) },
  ];

  const todas = [...data.completos, ...data.incompletos];

  guardarExportacion('pagos', columnas, todas, (f) => ({
    Comprobante: f.numero,
    Periodo: f.periodo,
    Alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
    Curso: f.alumno.curso,
    Tutor: f.tutor?.nombre ?? '',
    Total: f.total,
    Pagado: f.pagado,
    Saldo: f.saldo,
    Estado: f.estado,
    Vencimiento: f.fechaVencimiento,
  }));

  const desglose = tabla({
    caption: 'Desglose por estado',
    columnas: [
      { clave: 'estado', titulo: 'Estado', render: (f) => badge(f.estado) },
      { clave: 'cantidad', titulo: 'Facturas', alinear: 'derecha' },
      { clave: 'monto', titulo: 'Facturado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.monto)}</span>` },
      { clave: 'saldo', titulo: 'Saldo', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.saldo)}</span>` },
    ],
    filas: data.desglosePorEstado,
  });

  return `
    ${barra}
    ${grillaIndicadores([
      { titulo: 'Pagos completos', valor: data.totales.pagosCompletos, tono: 'ok', icono: 'fa-circle-check' },
      { titulo: 'Pagos incompletos', valor: data.totales.pagosIncompletos, tono: 'alerta', icono: 'fa-circle-exclamation' },
      { titulo: 'Facturado', valor: moneda(data.totales.montoFacturado), icono: 'fa-file-invoice-dollar' },
      { titulo: 'Cobrado', valor: moneda(data.totales.montoCobrado), tono: 'ok', icono: 'fa-coins' },
      { titulo: 'Saldo pendiente', valor: moneda(data.totales.saldoPendiente), tono: 'alerta', icono: 'fa-hourglass-half' },
      {
        titulo: 'Tasa de cobranza',
        valor: data.totales.tasaCobranza === null ? '—' : `${data.totales.tasaCobranza}%`,
        detalle: 'Facturas saldadas sobre el total',
        tono: (data.totales.tasaCobranza ?? 0) >= 80 ? 'ok' : 'espera',
        icono: 'fa-percent',
      },
    ])}
    <div class="ficha">${desglose}</div>
    ${botonExportar()}
    ${tabla({ caption: 'Detalle de facturas del período', columnas, filas: todas, vacio: 'No hay facturas que coincidan con los filtros.' })}`;
}

// ==================================================================
// Reporte 5 — Ingresos por rango de fechas
// ==================================================================

async function reporteIngresos(contenedor, valores = {}) {
  const hoy = new Date();
  const inicioAnio = `${hoy.getFullYear()}-01-01`;
  const hoyISO = hoy.toISOString().slice(0, 10);

  const barra = filtros({
    id: 'f-ingresos',
    campos: [
      { nombre: 'desde', etiqueta: 'Desde', tipo: 'date', valor: valores.desde ?? inicioAnio },
      { nombre: 'hasta', etiqueta: 'Hasta', tipo: 'date', valor: valores.hasta ?? hoyISO },
      { nombre: 'nivelId', etiqueta: 'Nivel', tipo: 'select', valor: valores.nivelId, opciones: opcionesNivel() },
    ],
  });

  const data = await api.reportes.ingresos({
    desde: valores.desde ?? inicioAnio,
    hasta: valores.hasta ?? hoyISO,
    nivelId: valores.nivelId,
  });

  const porAnio = tabla({
    caption: 'Ingresos discriminados por año',
    columnas: [
      { clave: 'anio', titulo: 'Año' },
      { clave: 'transferencias', titulo: 'Transferencias', alinear: 'derecha' },
      { clave: 'cobrado', titulo: 'Cobrado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.cobrado)}</span>` },
    ],
    filas: data.porAnio,
  });

  const porConcepto = tabla({
    caption: 'Ingresos por concepto',
    columnas: [
      { clave: 'tipo', titulo: 'Concepto', render: (f) => badge(f.tipo) },
      { clave: 'cobrado', titulo: 'Cobrado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.cobrado)}</span>` },
    ],
    filas: data.porConcepto,
  });

  const columnasAlumno = [
    { clave: 'legajo', titulo: 'Legajo' },
    { clave: 'alumno', titulo: 'Alumno', render: (f) => `${esc(f.apellido)}, ${esc(f.nombres)}` },
    { clave: 'curso', titulo: 'Curso' },
    { clave: 'nivel', titulo: 'Nivel' },
    { clave: 'transferencias', titulo: 'Transferencias', alinear: 'derecha' },
    { clave: 'cobrado', titulo: 'Cobrado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.cobrado)}</span>` },
  ];

  guardarExportacion('ingresos-por-alumno', columnasAlumno, data.porAlumno, (f) => ({
    Legajo: f.legajo,
    Alumno: `${f.apellido}, ${f.nombres}`,
    Curso: f.curso,
    Nivel: f.nivel,
    Transferencias: f.transferencias,
    Cobrado: f.cobrado,
  }));

  return `
    ${barra}
    <p class="nota-criterio">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      ${esc(data.criterio)}
    </p>
    ${grillaIndicadores([
      { titulo: 'Total cobrado', valor: moneda(data.totales.cobrado), tono: 'ok', icono: 'fa-sack-dollar' },
      { titulo: 'Transferencias', valor: data.totales.transferencias, icono: 'fa-receipt' },
      { titulo: 'Familias que pagaron', valor: data.totales.alumnosQuePagaron, icono: 'fa-users' },
      { titulo: 'Ticket promedio', valor: moneda(data.totales.ticketPromedio), icono: 'fa-calculator' },
    ])}
    <div class="grilla-tarjetas" style="margin-bottom:20px">
      <div class="ficha">${porAnio}</div>
      <div class="ficha">${porConcepto}</div>
    </div>
    ${botonExportar()}
    ${tabla({ caption: 'Ingresos discriminados por alumno', columnas: columnasAlumno, filas: data.porAlumno, vacio: 'No se registraron cobros en el rango elegido.' })}`;
}

// ==================================================================
// Reporte 6 — Morosidad
// ==================================================================

async function reporteMorosidad(contenedor, valores = {}) {
  const barra = filtros({
    id: 'f-morosidad',
    campos: [
      { nombre: 'nivelId', etiqueta: 'Nivel', tipo: 'select', valor: valores.nivelId, opciones: opcionesNivel() },
      { nombre: 'anio', etiqueta: 'Año', tipo: 'select', valor: valores.anio, opciones: [opcion('', 'Todos'), ...opcionesAnio()] },
    ],
  });

  const data = await api.reportes.morosidad(valores);

  const columnas = [
    { clave: 'legajo', titulo: 'Legajo' },
    { clave: 'alumno', titulo: 'Alumno', render: (f) => `${esc(f.apellido)}, ${esc(f.nombres)}` },
    { clave: 'curso', titulo: 'Curso' },
    { clave: 'tutor', titulo: 'Tutor responsable', render: (f) => (f.tutor ? `${esc(f.tutor.nombre)}<br><small>${esc(f.tutor.email)}</small>` : '<em>Sin tutor asignado</em>') },
    { clave: 'facturasImpagas', titulo: 'Facturas', alinear: 'derecha' },
    { clave: 'mesesAdeudados', titulo: 'Períodos', render: (f) => esc(f.mesesAdeudados.join(', ')) },
    { clave: 'deuda', titulo: 'Deuda', alinear: 'derecha', render: (f) => `<span class="numero"><strong>${moneda(f.deuda)}</strong></span>` },
  ];

  guardarExportacion('morosidad', columnas, data.filas, (f) => ({
    Legajo: f.legajo,
    Alumno: `${f.apellido}, ${f.nombres}`,
    Curso: f.curso,
    Tutor: f.tutor?.nombre ?? '',
    Email: f.tutor?.email ?? '',
    Facturas: f.facturasImpagas,
    Periodos: f.mesesAdeudados.join(' | '),
    Deuda: f.deuda,
  }));

  return `
    ${barra}
    ${grillaIndicadores([
      { titulo: 'Alumnos con deuda', valor: data.totales.alumnosConDeuda, tono: 'alerta', icono: 'fa-user-clock' },
      { titulo: 'Deuda total', valor: moneda(data.totales.deudaTotal), tono: 'alerta', icono: 'fa-triangle-exclamation' },
      { titulo: 'Facturas impagas', valor: data.totales.facturasImpagas, icono: 'fa-file-invoice' },
    ])}
    ${botonExportar()}
    ${tabla({ caption: 'Deuda viva por alumno', columnas, filas: data.filas, vacio: '¡No hay deuda registrada! Todas las familias están al día.' })}`;
}

// ==================================================================
// Exportación
// ==================================================================

let exportacionActual = null;

function guardarExportacion(nombre, _columnas, filas, mapear) {
  exportacionActual = { nombre, filas, mapear };
}

function botonExportar() {
  return `
    <div class="acciones-fila" style="margin-bottom:14px">
      <button type="button" class="btn btn--suave btn--chico" data-accion="exportar">
        <i class="fas fa-file-csv" aria-hidden="true"></i> Exportar a CSV
      </button>
      <button type="button" class="btn btn--suave btn--chico" onclick="window.print()">
        <i class="fas fa-print" aria-hidden="true"></i> Imprimir
      </button>
    </div>`;
}

function ejecutarExportacion() {
  if (!exportacionActual || exportacionActual.filas.length === 0) return;

  const { nombre, filas, mapear } = exportacionActual;
  const primera = mapear(filas[0]);
  const columnas = Object.keys(primera).map((clave) => ({ titulo: clave, valor: (f) => mapear(f)[clave] }));

  const hoy = new Date().toISOString().slice(0, 10);
  exportarCSV(`${nombre}-${hoy}.csv`, columnas, filas);
}

// ==================================================================
// Orquestación
// ==================================================================

const REPORTES = {
  deportes: { titulo: 'Alumnos por deporte', icono: 'fa-futbol', fn: reporteDeportes },
  materias: { titulo: 'Alumnos por materia', icono: 'fa-book', fn: reporteMaterias },
  transporte: { titulo: 'Alumnos por recorrido', icono: 'fa-bus', fn: reporteTransporte },
  pagos: { titulo: 'Pagos completos e incompletos', icono: 'fa-file-invoice-dollar', fn: reportePagos },
  ingresos: { titulo: 'Ingresos por período', icono: 'fa-chart-line', fn: reporteIngresos },
  morosidad: { titulo: 'Morosidad', icono: 'fa-user-clock', fn: reporteMorosidad },
};

let reporteActivo = 'deportes';

function pestanias() {
  return `
    <div class="pestanias" role="tablist" aria-label="Tipo de reporte">
      ${Object.entries(REPORTES)
        .map(
          ([clave, r]) => `
        <button type="button" role="tab" id="tab-${clave}"
                aria-selected="${clave === reporteActivo}"
                aria-controls="panel-reporte"
                data-reporte="${clave}"
                class="pestania${clave === reporteActivo ? ' pestania--activa' : ''}">
          <i class="fas ${r.icono}" aria-hidden="true"></i> ${esc(r.titulo)}
        </button>`,
        )
        .join('')}
    </div>`;
}

async function dibujar(valores = {}) {
  const panel = document.getElementById('panel-reporte');
  if (!panel) return;

  const reporte = REPORTES[reporteActivo];
  await render(panel, () => reporte.fn(panel, valores), { mensajeCarga: `Generando ${reporte.titulo.toLowerCase()}…` });

  // Los controles se recrean en cada dibujado, así que los listeners se
  // vuelven a enganchar acá y no en un `addEventListener` global.
  const form = panel.querySelector('form.filtros');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      dibujar(leerFiltros(form));
    });
    form.addEventListener('reset', () => {
      setTimeout(() => dibujar({}), 0);
    });
  }

  panel.querySelectorAll('[data-accion="exportar"]').forEach((btn) => {
    btn.addEventListener('click', ejecutarExportacion);
  });
}

/** Punto de entrada. Lo llama el panel de administración al abrir la vista. */
export async function iniciarReportes(idContenedor = 'vista-reportes') {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  contenedor.innerHTML = `
    ${pestanias()}
    <div id="panel-reporte" role="tabpanel" aria-labelledby="tab-${reporteActivo}" tabindex="0"></div>`;

  contenedor.querySelectorAll('[data-reporte]').forEach((btn) => {
    btn.addEventListener('click', () => {
      reporteActivo = btn.dataset.reporte;

      contenedor.querySelectorAll('.pestania').forEach((b) => {
        const activa = b === btn;
        b.classList.toggle('pestania--activa', activa);
        b.setAttribute('aria-selected', String(activa));
      });

      const panel = document.getElementById('panel-reporte');
      panel.setAttribute('aria-labelledby', `tab-${reporteActivo}`);
      dibujar({});
    });
  });

  await dibujar({});
}

export default { iniciarReportes };
