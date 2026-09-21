import { Router } from 'express';

// ------------------------------------------------------------------
// Composición de la API.
//
// Cada router vive dentro de su módulo de dominio en `src/modules/`; acá sólo
// se los cuelga de su prefijo. Los módulos siguen el recorte de la consigna
// —Alumnos, Profesores y Administrador— más Padres, que es un actor con
// reglas propias (RF-03: sólo ve a sus propios hijos), y dos agrupaciones
// transversales: los servicios institucionales que un alumno contrata y la
// comunicación, que cruza a los cuatro actores.
// ------------------------------------------------------------------

// --- Autenticación y acceso ---
import { passwordRouter } from '../modules/auth/password.routes';
import { authRouter } from '../modules/auth/auth.routes';

// --- Módulo Alumnos (RF-01) ---
import { alumnosRouter } from '../modules/alumnos/alumnos.routes';
import { estudiantesRouter } from '../modules/alumnos/estudiantes.routes';
import { calificacionesRouter } from '../modules/alumnos/calificaciones.routes';
import { asistenciaRouter } from '../modules/alumnos/asistencia.routes';

// --- Módulo Profesores (RF-04) ---
import { profesoresRouter } from '../modules/profesores/profesores.routes';
import { planesRouter } from '../modules/profesores/planes.routes';
import { actividadesRouter } from '../modules/profesores/actividades.routes';

// --- Módulo Administrador ---
import { administradorRouter } from '../modules/administrador/administrador.routes';
import { comunicadosRouter } from '../modules/administrador/comunicados.routes';
import { pagosRouter } from '../modules/administrador/pagos.routes';
import { academicoRouter } from '../modules/administrador/academico.routes';
import {
  moderacionPublicaRouter,
  moderacionAdminRouter,
  requireAdmin,
} from '../modules/administrador/moderacion.routes';

// --- Módulo Padres (RF-03) ---
import { padresRouter } from '../modules/padres/padres.routes';

// --- Servicios institucionales ---
import { deportesRouter } from '../modules/deportes/deportes.routes';
import { serviciosRouter } from '../modules/servicios/servicios.routes';
import { avisosRouter, transporteRouter } from '../modules/transporte/transporte.routes';
import { facturacionRouter } from '../modules/facturacion/facturacion.routes';
import { credencialesRouter, accesosRouter } from '../modules/credenciales/credenciales.routes';
import { reportesRouter } from '../modules/reportes/reportes.routes';

// --- Comunicación ---
import { foroRouter } from '../modules/comunicacion/foro.routes';
import { mensajesRouter } from '../modules/comunicacion/mensajes.routes';
import { notificacionesRouter } from '../modules/comunicacion/notificaciones.routes';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    name: 'Transformar para educar — API',
    version: '0.6.0',
  });
});

// El router de contraseñas se monta primero bajo /auth: aporta
// forgot-password, reset-password y change-password sin tocar authRouter.
router.use('/auth', passwordRouter);
router.use('/auth', authRouter);

// --- Módulo Alumnos ---
router.use('/alumnos', alumnosRouter);
router.use('/students', estudiantesRouter);
router.use('/grades', calificacionesRouter);
router.use('/attendance', asistenciaRouter);

// --- Módulo Profesores ---
router.use('/profesores', profesoresRouter);
router.use('/study-plans', planesRouter);
router.use('/activities', actividadesRouter);

// --- Módulo Padres ---
router.use('/padres', padresRouter);

// --- Servicios institucionales ---
router.use('/deportes', deportesRouter);
router.use('/servicios', serviciosRouter);
router.use('/transporte', transporteRouter);
router.use('/avisos', avisosRouter);
router.use('/facturacion', facturacionRouter);
router.use('/credenciales', credencialesRouter);
router.use('/accesos', accesosRouter);
router.use('/reportes', reportesRouter);

// --- Comunicación ---
router.use('/announcements', comunicadosRouter);
router.use('/notifications', notificacionesRouter);
router.use('/messages', mensajesRouter);
router.use('/forum', foroRouter);

// --- Módulo Administrador ---
// El muro público va antes del backoffice porque no exige sesión. El router de
// moderación se cuelga de /admin después de administradorRouter y detrás de su
// propio guard: el orden importa, invertirlo dejaría rutas sin verificar.
router.use('/academico', academicoRouter);
router.use('/payments', pagosRouter);
router.use('/public', moderacionPublicaRouter);
router.use('/admin', administradorRouter);
router.use('/admin', ...requireAdmin(), moderacionAdminRouter);

export { router as apiRouter };
