// Notification outbox. In production these go out through the WhatsApp Business API / SMS gateway
// (paid); here they are stored and shown in a WhatsApp-style inbox so the flow is free to demo.
import { db } from '../data/store';
import { randomId } from '../lib/crypto';

export function notify(to, text, { channel = 'whatsapp', title = '', link = '' } = {}) {
  return db.put('notifications', { id: randomId('N'), to, channel, title, text, link, at: new Date().toISOString(), read: false });
}

export const inboxFor = (user) => {
  if (!user) return [];
  const keys = new Set([user.id]);
  if (user.institutionId) keys.add(user.institutionId);
  if (user.region) keys.add(user.region);
  if (user.apaarId) keys.add('apaar:' + user.apaarId);
  if (user.role === 'aicte_admin') keys.add('AICTE');
  return db.where('notifications', (n) => keys.has(n.to)).sort((a, b) => b.at.localeCompare(a.at));
};

export function markAllRead(user) {
  const unread = inboxFor(user).filter((n) => !n.read);
  if (unread.length) db.putMany('notifications', unread.map((n) => ({ ...n, read: true })));
}
