import type { PayloadRequest } from 'payload';

// This CMS is admin-only. There is deliberately no public account registration.
export const authenticated = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user);
