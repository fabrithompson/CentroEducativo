import {
  PrismaClient,
  Role,
  AttendanceStatus,
  PaymentStatus,
  AnnouncementTarget,
  ActivityType,
  SubmissionStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type UserSeed = {
  usuario: string;
  email: string;
  dni: string;
  nombre: string;
  role: Role;
  curso: string | null;
};

const SEED_USERS: UserSeed[] = [
  { usuario: 'admin', email: 'admin@et.edu.ar', dni: '10000001', nombre: 'Administrador del Sistema', role: Role.ADMIN, curso: null },

  { usuario: 'mlopez',    email: 'm.lopez@et.edu.ar',    dni: '20000001', nombre: 'María López',     role: Role.DOCENTE, curso: null },
  { usuario: 'jgarcia',   email: 'j.garcia@et.edu.ar',   dni: '20000002', nombre: 'Javier García',   role: Role.DOCENTE, curso: null },
  { usuario: 'csilva',    email: 'c.silva@et.edu.ar',    dni: '20000003', nombre: 'Carolina Silva',  role: Role.DOCENTE, curso: null },
  { usuario: 'amartinez', email: 'a.martinez@et.edu.ar', dni: '20000004', nombre: 'Andrés Martínez', role: Role.DOCENTE, curso: null },

  { usuario: 'fbarrabino', email: 'f.barrabino@et.edu.ar', dni: '40000001', nombre: 'Franco Barrabino',   role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
  { usuario: 'jperez',     email: 'j.perez@et.edu.ar',     dni: '40000002', nombre: 'Juan Pérez',         role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
  { usuario: 'mgomez',     email: 'm.gomez@et.edu.ar',     dni: '40000003', nombre: 'María Gómez',        role: Role.ESTUDIANTE, curso: 'Primario — 6to Grado' },
  { usuario: 'lferreyra',  email: 'l.ferreyra@et.edu.ar',  dni: '40000004', nombre: 'Lucía Ferreyra',     role: Role.ESTUDIANTE, curso: 'Secundario — 2do Año' },
  { usuario: 'srodriguez', email: 's.rodriguez@et.edu.ar', dni: '40000005', nombre: 'Sofía Rodríguez',    role: Role.ESTUDIANTE, curso: 'Secundario — 3er Año' },
  { usuario: 'tmoreno',    email: 't.moreno@et.edu.ar',    dni: '40000006', nombre: 'Tomás Moreno',       role: Role.ESTUDIANTE, curso: 'Primario — 5to Grado' },
  { usuario: 'vsanchez',   email: 'v.sanchez@et.edu.ar',   dni: '40000007', nombre: 'Valentina Sánchez',  role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
  { usuario: 'iflores',    email: 'i.flores@et.edu.ar',    dni: '40000008', nombre: 'Ignacio Flores',     role: Role.ESTUDIANTE, curso: 'Primario — 6to Grado' },

  { usuario: 'pbarrabino', email: 'p.barrabino@et.edu.ar', dni: '30000001', nombre: 'Patricia Barrabino', role: Role.PADRE, curso: null },
  { usuario: 'rperez',     email: 'r.perez@et.edu.ar',     dni: '30000002', nombre: 'Roberto Pérez',      role: Role.PADRE, curso: null },
  { usuario: 'mgomezp',    email: 'm.gomez.padre@et.edu.ar', dni: '30000003', nombre: 'Mariana Gómez',    role: Role.PADRE, curso: null },
];

const LINKS = [
  { padre: 'pbarrabino', hijos: ['fbarrabino'] },
  { padre: 'rperez',     hijos: ['jperez'] },
  { padre: 'mgomezp',    hijos: ['mgomez', 'iflores'] },
];

type GradeSeed = {
  estudiante: string;
  docente: string;
  materia: string;
  instancia: string;
  nota: number;
  daysAgo: number;
};

const GRADES: GradeSeed[] = [
  { estudiante: 'fbarrabino', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 8, daysAgo: 60 },
  { estudiante: 'fbarrabino', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '2do Trimestre', nota: 9, daysAgo: 12 },
  { estudiante: 'fbarrabino', docente: 'jgarcia',   materia: 'Literatura',          instancia: '1er Trimestre', nota: 7, daysAgo: 55 },
  { estudiante: 'fbarrabino', docente: 'jgarcia',   materia: 'Literatura',          instancia: '2do Trimestre', nota: 8, daysAgo: 10 },
  { estudiante: 'fbarrabino', docente: 'csilva',    materia: 'Física',              instancia: '1er Trimestre', nota: 6, daysAgo: 40 },
  { estudiante: 'fbarrabino', docente: 'csilva',    materia: 'Química',             instancia: '1er Trimestre', nota: 7, daysAgo: 30 },
  { estudiante: 'fbarrabino', docente: 'amartinez', materia: 'Historia',            instancia: '1er Trimestre', nota: 9, daysAgo: 25 },
  { estudiante: 'fbarrabino', docente: 'amartinez', materia: 'Inglés',              instancia: '1er Trimestre', nota: 10, daysAgo: 20 },

  { estudiante: 'jperez', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 9,  daysAgo: 60 },
  { estudiante: 'jperez', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '2do Trimestre', nota: 10, daysAgo: 8 },
  { estudiante: 'jperez', docente: 'jgarcia',   materia: 'Literatura',          instancia: '1er Trimestre', nota: 7,  daysAgo: 50 },
  { estudiante: 'jperez', docente: 'csilva',    materia: 'Química',             instancia: '1er Trimestre', nota: 8,  daysAgo: 15 },
  { estudiante: 'jperez', docente: 'csilva',    materia: 'Física',              instancia: '1er Trimestre', nota: 7,  daysAgo: 35 },
  { estudiante: 'jperez', docente: 'amartinez', materia: 'Inglés',              instancia: '1er Trimestre', nota: 9,  daysAgo: 22 },

  { estudiante: 'mgomez', docente: 'mlopez',    materia: 'Matemáticas',            instancia: '1er Trimestre', nota: 10, daysAgo: 55 },
  { estudiante: 'mgomez', docente: 'mlopez',    materia: 'Matemáticas',            instancia: '2do Trimestre', nota: 9,  daysAgo: 8 },
  { estudiante: 'mgomez', docente: 'jgarcia',   materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 9,  daysAgo: 45 },
  { estudiante: 'mgomez', docente: 'amartinez', materia: 'Ciencias Sociales',      instancia: '1er Trimestre', nota: 8,  daysAgo: 30 },
  { estudiante: 'mgomez', docente: 'csilva',    materia: 'Ciencias Naturales',     instancia: '1er Trimestre', nota: 10, daysAgo: 25 },

  { estudiante: 'lferreyra', docente: 'jgarcia',   materia: 'Literatura',          instancia: '1er Trimestre', nota: 7, daysAgo: 50 },
  { estudiante: 'lferreyra', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 6, daysAgo: 45 },
  { estudiante: 'lferreyra', docente: 'csilva',    materia: 'Biología',            instancia: '1er Trimestre', nota: 8, daysAgo: 28 },
  { estudiante: 'lferreyra', docente: 'amartinez', materia: 'Historia',            instancia: '1er Trimestre', nota: 7, daysAgo: 20 },

  { estudiante: 'srodriguez', docente: 'mlopez',    materia: 'Matemática Discreta', instancia: '1er Trimestre', nota: 9, daysAgo: 50 },
  { estudiante: 'srodriguez', docente: 'csilva',    materia: 'Química Orgánica',    instancia: '1er Trimestre', nota: 8, daysAgo: 35 },
  { estudiante: 'srodriguez', docente: 'amartinez', materia: 'Geografía',           instancia: '1er Trimestre', nota: 10, daysAgo: 20 },

  { estudiante: 'tmoreno', docente: 'mlopez',  materia: 'Matemáticas',            instancia: '1er Trimestre', nota: 7, daysAgo: 50 },
  { estudiante: 'tmoreno', docente: 'jgarcia', materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 8, daysAgo: 40 },
  { estudiante: 'tmoreno', docente: 'csilva',  materia: 'Ciencias Naturales',     instancia: '1er Trimestre', nota: 9, daysAgo: 25 },

  { estudiante: 'vsanchez', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 9,  daysAgo: 55 },
  { estudiante: 'vsanchez', docente: 'jgarcia',   materia: 'Literatura',          instancia: '1er Trimestre', nota: 10, daysAgo: 30 },
  { estudiante: 'vsanchez', docente: 'amartinez', materia: 'Inglés',              instancia: '1er Trimestre', nota: 9,  daysAgo: 18 },

  { estudiante: 'iflores', docente: 'mlopez',  materia: 'Matemáticas',            instancia: '1er Trimestre', nota: 8, daysAgo: 48 },
  { estudiante: 'iflores', docente: 'jgarcia', materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 7, daysAgo: 38 },
  { estudiante: 'iflores', docente: 'csilva',  materia: 'Ciencias Naturales',     instancia: '1er Trimestre', nota: 9, daysAgo: 22 },
];

const ANUNCIOS = [
  { autor: 'admin',    titulo: 'Bienvenida al Ciclo 2026',     contenido: 'Les damos la bienvenida al nuevo ciclo lectivo. Las clases comienzan el lunes a las 7:30hs.', target: 'ALL' },
  { autor: 'admin',    titulo: 'Reunión de Personal Docente',  contenido: 'Convocatoria a reunión institucional el viernes 12 de junio a las 18:00 hs en el SUM. Asistencia obligatoria.', target: 'DOCENTE' },
  { autor: 'mlopez',   titulo: 'Trabajo Práctico de Álgebra',  contenido: 'Recuerden traer la guía de ejercicios resuelta para el próximo encuentro.', target: 'ESTUDIANTE' },
  { autor: 'admin',    titulo: 'Cierre de Inscripciones',      contenido: 'Las inscripciones a actividades extracurriculares cierran el viernes 30. Consulten en secretaría.', target: 'PADRE' },
  { autor: 'jgarcia',  titulo: 'Festival de Ciencias',         contenido: 'El próximo mes realizaremos el festival anual de ciencias. ¡Anímense a participar!', target: 'ALL' },
  { autor: 'amartinez', titulo: 'Mesa de Exámenes Libres',     contenido: 'Las mesas de exámenes libres serán del 15 al 20 de junio. Consultar el cronograma en la web.', target: 'ESTUDIANTE' },
];

async function main() {
  console.log('🌱 Seeding...');

  const passwordHash = await bcrypt.hash('123456', 10);
  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { usuario: u.usuario },
      update: {},
      create: { ...u, password: passwordHash },
    });
  }

  const byUsername = new Map<string, number>();
  for (const u of await prisma.user.findMany({ select: { id: true, usuario: true } })) {
    byUsername.set(u.usuario, u.id);
  }
  const uid = (u: string) => byUsername.get(u)!;

  for (const link of LINKS) {
    for (const hijo of link.hijos) {
      await prisma.parentStudentLink.upsert({
        where: { padreId_estudianteId: { padreId: uid(link.padre), estudianteId: uid(hijo) } },
        update: {},
        create: { padreId: uid(link.padre), estudianteId: uid(hijo) },
      });
    }
  }

  const today = new Date();
  const dayIso = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  await prisma.grade.deleteMany({});
  await prisma.grade.createMany({
    data: GRADES.map((g) => ({
      estudianteId: uid(g.estudiante),
      docenteId: uid(g.docente),
      materia: g.materia,
      instancia: g.instancia,
      nota: g.nota,
      fecha: dayIso(g.daysAgo),
    })),
  });

  // ---- Asistencias (últimos 25 días hábiles, por estudiante)
  await prisma.attendance.deleteMany({});
  const estudiantes = SEED_USERS.filter((u) => u.role === Role.ESTUDIANTE);
  const asistenciasData: { estudianteId: number; fecha: Date; status: AttendanceStatus; materia: string; observacion: string | null }[] = [];
  for (let offset = 0; offset < 35; offset++) {
    const d = dayIso(offset);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const est of estudiantes) {
      const seed = (uid(est.usuario) * 31 + d.getDate() + d.getMonth() * 100 + d.getFullYear() * 13) % 22;
      let status: AttendanceStatus = AttendanceStatus.PRESENTE;
      let obs: string | null = null;
      if (seed === 0) { status = AttendanceStatus.AUSENTE; obs = 'Ausencia sin aviso'; }
      else if (seed === 1) { status = AttendanceStatus.TARDE; obs = 'Llegó tras el primer módulo'; }
      else if (seed === 2) { status = AttendanceStatus.JUSTIFICADO; obs = 'Certificado médico'; }
      asistenciasData.push({ estudianteId: uid(est.usuario), fecha: d, status, materia: '', observacion: obs });
    }
  }
  if (asistenciasData.length > 0) {
    await prisma.attendance.createMany({ data: asistenciasData });
  }

  // ---- Pagos (5 cuotas mock por estudiante)
  await prisma.payment.deleteMany({});
  const pagosData: { estudianteId: number; padreId: number | null; concepto: string; monto: number; vencimiento: Date; pagadoEn: Date | null; status: PaymentStatus }[] = [];
  const conceptos = [
    { c: 'Matrícula Ciclo 2026',    venc: dayIso(120), pagado: dayIso(115), st: PaymentStatus.PAGADO,    monto: 50000 },
    { c: 'Cuota Mensual — Marzo',   venc: dayIso(95),  pagado: dayIso(92),  st: PaymentStatus.PAGADO,    monto: 45000 },
    { c: 'Cuota Mensual — Abril',   venc: dayIso(65),  pagado: null,        st: PaymentStatus.VENCIDO,   monto: 45000 },
    { c: 'Cuota Mensual — Mayo',    venc: dayIso(35),  pagado: dayIso(33),  st: PaymentStatus.PAGADO,    monto: 45000 },
    { c: 'Cuota Mensual — Junio',   venc: dayIso(-5),  pagado: null,        st: PaymentStatus.PENDIENTE, monto: 45000 },
  ];
  // Asociamos cada estudiante con su padre, si existe
  const padreDe = new Map<number, number>();
  for (const link of LINKS) for (const hijo of link.hijos) padreDe.set(uid(hijo), uid(link.padre));

  for (const est of estudiantes) {
    const estId = uid(est.usuario);
    const padreId = padreDe.get(estId) ?? null;
    for (const c of conceptos) {
      pagosData.push({ estudianteId: estId, padreId, concepto: c.c, monto: c.monto, vencimiento: c.venc, pagadoEn: c.pagado, status: c.st });
    }
  }
  await prisma.payment.createMany({ data: pagosData });

  // ---- Anuncios
  await prisma.announcement.deleteMany({});
  for (const a of ANUNCIOS) {
    await prisma.announcement.create({
      data: {
        authorId: uid(a.autor),
        titulo: a.titulo,
        contenido: a.contenido,
        targetRole: a.target as AnnouncementTarget,
      },
    });
  }

  // ---- Notificaciones
  await prisma.notification.deleteMany({});
  await prisma.notification.createMany({
    data: [
      { userId: uid('fbarrabino'), titulo: 'Nueva calificación cargada', contenido: 'María López cargó tu nota de Álgebra (2do Trim).' },
      { userId: uid('jperez'),     titulo: 'Recordatorio de cuota',       contenido: 'La cuota de Junio vence en 5 días.' },
      { userId: uid('mlopez'),     titulo: 'Nueva entrega pendiente',     contenido: 'Tenés 3 entregas por revisar.' },
      { userId: uid('pbarrabino'), titulo: 'Nuevo anuncio',               contenido: 'Bienvenida al Ciclo 2026.' },
      { userId: uid('rperez'),     titulo: 'Cuota vencida',               contenido: 'La cuota de Abril sigue impaga.' },
    ],
  });

  // ---- Mensajes (1 conversación por contexto)
  await prisma.message.deleteMany({});
  await prisma.message.createMany({
    data: [
      { senderId: uid('pbarrabino'), receiverId: uid('mlopez'),     contenido: 'Hola María, ¿cómo viene Franco con Álgebra?' },
      { senderId: uid('mlopez'),     receiverId: uid('pbarrabino'), contenido: 'Muy bien, está participando y entregó todos los TPs.' },
      { senderId: uid('fbarrabino'), receiverId: uid('jgarcia'),    contenido: 'Profe, ¿la entrega del trabajo de Literatura es escrita o exposición?' },
      { senderId: uid('jgarcia'),    receiverId: uid('fbarrabino'), contenido: 'Es escrita, mínimo 2 carillas.' },
      { senderId: uid('rperez'),     receiverId: uid('csilva'),     contenido: 'Hola, consultaba por las notas de Química de Juan.' },
    ],
  });

  // ---- Actividades + entregas
  await prisma.activity.deleteMany({});
  const act1 = await prisma.activity.create({
    data: {
      docenteId: uid('mlopez'),
      materia: 'Álgebra y Geometría',
      titulo: 'TP1: Sistemas de Ecuaciones',
      descripcion: 'Resolver los 10 ejercicios del cuadernillo. Entregar PDF escaneado o foto.',
      tipo: ActivityType.TRABAJO,
      fechaEntrega: dayIso(-7),
      maxScore: 10,
    },
  });
  const act2 = await prisma.activity.create({
    data: {
      docenteId: uid('jgarcia'),
      materia: 'Literatura',
      titulo: 'Análisis de Cuento — "Casa Tomada"',
      descripcion: 'Análisis de personajes, narrador, simbología. Mínimo 2 carillas.',
      tipo: ActivityType.ACTIVIDAD,
      fechaEntrega: dayIso(-3),
      maxScore: 10,
    },
  });
  const act3 = await prisma.activity.create({
    data: {
      docenteId: uid('csilva'),
      materia: 'Física',
      titulo: 'Parcial: Cinemática',
      descripcion: 'Parcial integrador sobre MRU, MRUV y caída libre.',
      tipo: ActivityType.PARCIAL,
      fechaEntrega: dayIso(-14),
      maxScore: 10,
    },
  });
  await prisma.submission.createMany({
    data: [
      { activityId: act1.id, estudianteId: uid('fbarrabino'), textContent: 'Adjunto los 10 ejercicios resueltos.', status: SubmissionStatus.CALIFICADO, score: 9, feedback: 'Muy bien resuelto, atención al ejercicio 7.', entregadoEn: dayIso(2), calificadoEn: dayIso(1) },
      { activityId: act1.id, estudianteId: uid('jperez'),     textContent: 'Resuelto, en el ejercicio 5 tuve dudas.', status: SubmissionStatus.ENTREGADO, entregadoEn: dayIso(1) },
      { activityId: act2.id, estudianteId: uid('fbarrabino'), textContent: 'El cuento muestra una alegoría del peronismo...', status: SubmissionStatus.ENTREGADO, entregadoEn: dayIso(0) },
    ],
  });

  // ---- Planes de estudio
  await prisma.studyPlan.deleteMany({});
  await prisma.studyPlan.createMany({
    data: [
      {
        docenteId: uid('mlopez'),
        materia: 'Álgebra y Geometría',
        titulo: 'Plan de Estudios — Álgebra 1er Año',
        objetivos: 'Operar con números reales, plantear y resolver ecuaciones e inecuaciones de primer grado, interpretar gráficamente sistemas de dos ecuaciones.',
        contenidos: 'Unidad 1: Números Reales. Unidad 2: Ecuaciones. Unidad 3: Sistemas. Unidad 4: Geometría plana.',
      },
      {
        docenteId: uid('jgarcia'),
        materia: 'Literatura',
        titulo: 'Plan de Estudios — Literatura 1er Año',
        objetivos: 'Reconocer géneros literarios, analizar textos narrativos y poéticos, producir textos propios con coherencia y cohesión.',
        contenidos: 'Unidad 1: Cuento realista. Unidad 2: Cuento fantástico (Cortázar). Unidad 3: Poesía. Unidad 4: Teatro.',
      },
      {
        docenteId: uid('csilva'),
        materia: 'Física',
        titulo: 'Plan de Estudios — Física 1er Año',
        objetivos: 'Comprender los conceptos básicos de cinemática y dinámica, resolver problemas aplicando fórmulas, interpretar gráficos de movimiento.',
        contenidos: 'Unidad 1: Magnitudes y unidades. Unidad 2: Cinemática (MRU/MRUV). Unidad 3: Dinámica. Unidad 4: Energía.',
      },
    ],
  });

  console.log('✅ Seed completo. Password de todos los usuarios: 123456');
  console.log(`   ${SEED_USERS.length} usuarios · ${GRADES.length} notas · ${asistenciasData.length} asistencias · ${pagosData.length} cuotas · ${ANUNCIOS.length} anuncios · 3 actividades · 3 planes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
