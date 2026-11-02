// Consent ledger (DPDP Act 2023 principles): purpose-bound, field-limited, time-limited, revocable,
// and every access is logged where the student can see it.
import { db } from '../data/store';
import { CONSENT_FIELDS } from '../lib/constants';
import { randomId } from '../lib/crypto';
import { apaarFormatOk } from '../lib/util';
import { audit } from './audit';
import { notify } from './notify';

export function requestConsent({ apaarId, purpose, fields, days }, verifier) {
  if (!apaarFormatOk(apaarId)) throw new Error('Enter a valid 12-digit APAAR ID.');
  if (!purpose || purpose.length < 10) throw new Error('Describe the purpose in at least 10 characters.');
  if (!fields.length) throw new Error('Choose at least one field.');
  const c = {
    id: randomId('C'),
    apaarId,
    requesterId: verifier.id,
    requesterName: verifier.name,
    requesterOrg: verifier.org || verifier.name,
    orgType: verifier.orgType || 'Employer',
    purpose,
    fields,
    days: Number(days) || 30,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };
  db.put('consents', c);
  notify('apaar:' + apaarId, `${c.requesterOrg} (${c.orgType}) asks to see your ${fields.map((f) => CONSENT_FIELDS[f]).join(', ')} for: "${purpose}". Open APAAR-Setu > Consent to allow or deny.`, { title: 'Consent request' });
  audit(verifier, 'CONSENT_REQUEST', 'consent:' + c.id, { detail: `${fields.join(',')} for ${c.days} days` });
  return c;
}

export function primaryEnrolment(apaarId) {
  const list = db.where('enrolments', (e) => e.apaarId === apaarId);
  return list.find((e) => e.status === 'active' && e.recordState !== 'on_hold') || list.find((e) => e.status === 'graduated') || list[0];
}

export function snapshotFor(apaarId, fields) {
  const e = primaryEnrolment(apaarId);
  if (!e) return {};
  const inst = db.get('institutions', e.institutionId);
  const all = {
    name: e.name,
    programme: e.course,
    institution: inst?.name,
    admissionYear: e.academicYear,
    status: e.status === 'active' ? 'Enrolled' : e.status,
    dob: e.dob,
    category: e.category,
  };
  return Object.fromEntries(fields.map((f) => [f, all[f]]));
}

export function decide(c, decision, student, fields) {
  const now = new Date();
  let next;
  if (decision === 'grant') {
    const allowed = (fields && fields.length ? fields : c.fields).filter((f) => c.fields.includes(f));
    next = { ...c, status: 'granted', grantedFields: allowed, sharedData: snapshotFor(c.apaarId, allowed), grantedAt: now.toISOString(), expiresAt: new Date(now.getTime() + c.days * 86400000).toISOString() };
  } else if (decision === 'deny') next = { ...c, status: 'denied', decidedAt: now.toISOString() };
  else if (decision === 'revoke') next = { ...c, status: 'revoked', sharedData: null, revokedAt: now.toISOString() };
  db.put('consents', next);
  notify(c.requesterId, `Consent ${next.status} by the student for APAAR ${c.apaarId.slice(0, 4)}••••${c.apaarId.slice(-4)} (${c.purpose}).`, { title: 'Consent ' + next.status });
  audit(student, 'CONSENT_' + decision.toUpperCase(), 'consent:' + c.id, { detail: (next.grantedFields || []).join(',') });
  return next;
}

export function effectiveStatus(c) {
  if (c.status === 'granted' && c.expiresAt && new Date(c.expiresAt) < new Date()) return 'expired';
  return c.status;
}

// Verifier opens the shared record: allowed only while consent is live; the access is logged.
export function openSharedRecord(c, verifier) {
  if (effectiveStatus(c) !== 'granted') throw new Error('Consent is not active.');
  logAccess({ apaarId: c.apaarId, actor: verifier, org: c.requesterOrg, purpose: c.purpose, fields: c.grantedFields, basis: 'Consent ' + c.id.slice(0, 8) });
  return c.sharedData;
}

export function logAccess({ apaarId, actor, org, purpose, fields, basis }) {
  db.put('accessLog', { id: randomId('X'), apaarId, actorId: actor.id, actorName: actor.name, org: org || actor.org || 'AICTE', role: actor.role, purpose, fields: fields || [], basis, at: new Date().toISOString() });
}
