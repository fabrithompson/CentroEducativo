import { Router } from 'express';
import {
  listarOpiniones,
  crearOpinion,
  crearInscripcion,
  crearContacto,
  crearPostulacion,
  listarNoticias,
} from '../controllers/publicController.js';
import { subirCV } from '../middleware/upload.js';

const router = Router();

// Opiniones (listar + crear, ambas públicas)
router.get('/opiniones', listarOpiniones);
router.post('/opiniones', crearOpinion);

// Inscripciones (crear)
router.post('/inscripciones', crearInscripcion);

// Contacto (crear)
router.post('/contacto', crearContacto);

// Empleo / postulaciones: el CV viaja como multipart. Capturamos errores de Multer.
router.post('/empleo', (req, res) => {
  subirCV(req, res, (err) => {
    if (err) return res.status(400).json({ errores: [err.message] });
    return crearPostulacion(req, res);
  });
});

// Noticias (listar)
router.get('/noticias', listarNoticias);

export default router;
