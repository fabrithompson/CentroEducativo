import { Router } from 'express';

import { authRouter } from './auth.routes';
import { gradesRouter } from './grades.routes';
import { studentsRouter } from './students.routes';
import { parentRouter } from './parent.routes';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    name: 'Educar para Transformar — API',
    version: '0.1.0',
  });
});

router.use('/auth', authRouter);
router.use('/grades', gradesRouter);
router.use('/students', studentsRouter);
router.use('/parent', parentRouter);

export { router as apiRouter };
