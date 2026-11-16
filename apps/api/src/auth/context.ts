import type { Response } from 'express';
import type { AuthSession, User, Membership } from '@prisma/client';

export type Context = { session: AuthSession; user: User; membership?: Membership };
export const context = (res: Response) => res.locals.auth as Context;
