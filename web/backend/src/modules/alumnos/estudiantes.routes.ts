import { Router } from 'express';
import { EstadoInscripcion, Role } from '@prisma/client';

import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../../middleware/auth';
import { HttpError } from '../../utils/httpError';
import { minutosAHora } from '../deportes/horarios';

const router = Router();

router.get('/', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (_req, res, next) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: Role.ESTUDIANTE, isActive: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, dni: true, curso: true },
    });
    res.json({ exito: true, estudiantes: students });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/students/mi-cursado
 *
 * Lo que cursa el estudiante que pregunta: su curso con las materias y el
 * docente de cada una, y los deportes en los que está inscripto con sus
 * horarios. Reemplaza la "grilla de cursado" fija que mostraba el panel, que
 * era la misma para todos los estudiantes y no salía de la base.
 */
router.get('/mi-cursado', requireAuth, requireRole(Role.ESTUDIANTE), async (req, res, next) => {
  try {
    const alumno = await prisma.alumno.findUnique({
      where: { userId: req.authUser!.id },
      select: {
        legajo: true,
        curso: {
          select: {
            nombre: true,
            division: true,
            turno: true,
            anioLectivo: true,
            nivelId: true,
            nivel: { select: { nombre: true } },
            materias: {
              where: { activo: true },
              orderBy: { nombre: 'asc' },
              select: {
                id: true,
                nombre: true,
                cargaHoraria: true,
                profesor: { select: { apellido: true, nombres: true } },
              },
            },
          },
        },
        inscripcionesDeporte: {
          where: { estado: EstadoInscripcion.ACTIVA },
          orderBy: { slot: 'asc' },
          select: {
            deporte: {
              select: {
                nombre: true,
                horarios: {
                  where: { activo: true },
                  orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
                  select: { nivelId: true, diaSemana: true, horaInicio: true, horaFin: true, lugar: true },
                },
              },
            },
          },
        },
      },
    });
    if (!alumno) {
      throw new HttpError(404, 'Tu cuenta todavía no está vinculada a un alumno del padrón. Consultá en administración.');
    }

    const { nivelId, materias, ...curso } = alumno.curso;
    res.json({
      exito: true,
      legajo: alumno.legajo,
      curso,
      // Orden alfabético del castellano: con la intercalación de la base,
      // "Álgebra" quedaba después de "Química".
      materias: [...materias].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')).map((m) => ({
        id: m.id,
        nombre: m.nombre,
        cargaHoraria: m.cargaHoraria,
        docente: m.profesor ? `${m.profesor.apellido}, ${m.profesor.nombres}` : null,
      })),
      // Cada deporte tiene grupos por nivel: sólo interesan los del nivel del alumno.
      deportes: alumno.inscripcionesDeporte.map(({ deporte }) => ({
        nombre: deporte.nombre,
        horarios: deporte.horarios
          .filter((h) => h.nivelId === nivelId)
          .map((h) => ({
            diaSemana: h.diaSemana,
            desde: minutosAHora(h.horaInicio),
            hasta: minutosAHora(h.horaFin),
            lugar: h.lugar,
          })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export { router as estudiantesRouter };
