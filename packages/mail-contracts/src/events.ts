import type { EventType } from './index';
export const MAIL_EVENTS: readonly EventType[] = ['email.scheduled','email.canceled','email.sent','email.delivery_delayed','email.delivered','email.opened','email.clicked','email.bounced','email.complained','email.unsubscribed','email.failed','email.suppressed','domain.created','domain.updated','domain.deleted'];
export function isMailEvent(value: unknown): value is EventType { return typeof value==='string' && MAIL_EVENTS.includes(value as EventType); }
