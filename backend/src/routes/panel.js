import { Router } from 'express';
import { resumen } from '../controllers/panelController.js';
import { autenticar } from '../middleware/auth.js';

const router = Router();

// Todas las rutas del panel requieren un token válido.
router.get('/resumen', autenticar, resumen);

export default router;
