import { Router } from 'express';

const router = Router();

/**
 * GET /api
 * Punto de bienvenida de la API. Útil para verificar que el router base está montado.
 */
router.get('/', (_req, res) => {
  res.json({
    name: 'Educar para Transformar — API',
    version: '0.1.0',
    docs: '/api (en construcción)',
  });
});

// Los routers por módulo se montarán acá a medida que se implementen:
// router.use('/auth', authRouter);
// router.use('/student', studentRouter);
// router.use('/teacher', teacherRouter);
// router.use('/parent', parentRouter);
// router.use('/admin', adminRouter);

export { router as apiRouter };
