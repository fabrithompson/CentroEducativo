import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { logger } from '../utils/logger';

/**
 * Errores conocidos de Prisma que son culpa del pedido y no del servidor.
 * Antes caían todos en el 500 genérico: borrar algo que otra pestaña ya había
 * borrado decía "Error interno del servidor", y un DNI repetido también.
 */
function errorDePrisma(err: Prisma.PrismaClientKnownRequestError): HttpError | null {
  switch (err.code) {
    case 'P2002': {
      const campos = (err.meta?.target as string[] | string | undefined) ?? [];
      const lista = Array.isArray(campos) ? campos.join(', ') : campos;
      return new HttpError(409, lista
        ? `Ya existe un registro con ese valor (${lista}).`
        : 'Ya existe un registro con esos datos.');
    }
    case 'P2025':
      return new HttpError(404, 'El registro no existe o ya fue eliminado. Actualizá la pantalla.');
    case 'P2003':
      return new HttpError(409, 'No se puede completar: el registro está vinculado a otros datos.');
    default:
      return null;
  }
}

function errorDeSubida(err: MulterError): HttpError {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new HttpError(413, `El archivo supera el máximo de ${env.MAX_UPLOAD_SIZE_MB} MB.`);
  }
  return new HttpError(400, 'No se pudo recibir el archivo adjunto.');
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler: ErrorRequestHandler = (errOriginal, req, res, _next) => {
  let err: unknown = errOriginal;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    err = errorDePrisma(err) ?? err;
  } else if (err instanceof MulterError) {
    err = errorDeSubida(err);
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Datos inválidos',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.name,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  logger.error('Unhandled error', {
    method: req.method,
    url: req.originalUrl,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message:
      process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : (err instanceof Error ? err.message : String(err)),
  });
};
