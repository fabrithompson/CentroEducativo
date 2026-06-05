import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: number;
        role: Role;
        usuario: string;
      };
    }
  }
}

export {};
