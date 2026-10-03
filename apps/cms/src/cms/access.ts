import type { Access, PayloadRequest, User } from 'payload';

export const isSuperAdmin = (user?: User | null): boolean => user?.collection === 'users' && user?.role === 'super-admin';
export const superAdmin = ({ req }: { req: PayloadRequest }): boolean => isSuperAdmin(req.user);
export const signedIn = ({ req }: { req: PayloadRequest }): boolean => req.user?.collection === 'users';
export const editor = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user?.collection === 'users' && req.user.role !== 'site-reader');
export const selfOrSuperAdmin: Access = ({ req }) => {
  if (isSuperAdmin(req.user)) return true;
  return req.user?.collection === 'users' ? { id: { equals: req.user.id } } : false;
};

export const updateOwnAccount: Access = (args) => editor(args) ? selfOrSuperAdmin(args) : false;
