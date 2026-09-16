import { Router } from 'express';

import { authRouter } from './auth.routes';
import { gradesRouter } from './grades.routes';
import { studentsRouter } from './students.routes';
import { parentRouter } from './parent.routes';
import { attendanceRouter } from './attendance.routes';
import { paymentsRouter } from './payments.routes';
import { announcementsRouter } from './announcements.routes';
import { notificationsRouter } from './notifications.routes';
import { messagesRouter } from './messages.routes';
import { activitiesRouter } from './activities.routes';
import { studyPlansRouter } from './studyPlans.routes';
import { forumRouter } from './forum.routes';
import { adminRouter } from './admin.routes';
import { moderationPublicRouter, moderationAdminRouter, requireAdmin } from './moderation.routes';

// --- Módulos del sistema de gestión (Sprint 2) ---
import { passwordRouter } from '../modules/auth/password.routes';
import { alumnosRouter } from '../modules/alumnos/alumnos.routes';
import { profesoresRouter } from '../modules/profesores/profesores.routes';
import { deportesRouter } from '../modules/deportes/deportes.routes';
import { serviciosRouter } from '../modules/servicios/servicios.routes';
import { padresRouter } from '../modules/padres/padres.routes';
import { reportesRouter } from '../modules/reportes/reportes.routes';
import { facturacionRouter } from '../modules/facturacion/facturacion.routes';
import { credencialesRouter, accesosRouter } from '../modules/credenciales/credenciales.routes';
import { avisosRouter, transporteRouter } from '../modules/transporte/transporte.routes';

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

// --- Sistema de gestión ---
router.use('/alumnos', alumnosRouter);
router.use('/profesores', profesoresRouter);
router.use('/deportes', deportesRouter);
router.use('/servicios', serviciosRouter);
router.use('/padres', padresRouter);
router.use('/reportes', reportesRouter);
router.use('/facturacion', facturacionRouter);
router.use('/credenciales', credencialesRouter);
router.use('/accesos', accesosRouter);
router.use('/avisos', avisosRouter);
router.use('/transporte', transporteRouter);

router.use('/grades', gradesRouter);
router.use('/students', studentsRouter);
router.use('/parent', parentRouter);
router.use('/attendance', attendanceRouter);
router.use('/payments', paymentsRouter);
router.use('/announcements', announcementsRouter);
router.use('/notifications', notificationsRouter);
router.use('/messages', messagesRouter);
router.use('/activities', activitiesRouter);
router.use('/study-plans', studyPlansRouter);
router.use('/forum', forumRouter);
router.use('/admin', adminRouter);
router.use('/public', moderationPublicRouter);
router.use('/admin', ...requireAdmin(), moderationAdminRouter);

export { router as apiRouter };
