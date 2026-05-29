import { Router } from 'express';
import { registrar, login, perfil } from '../controllers/authController.js';
import { autenticar } from '../middleware/auth.js';

const router = Router();

router.post('/register', registrar);
router.post('/login', login);
router.get('/me', autenticar, perfil);

export default router;
