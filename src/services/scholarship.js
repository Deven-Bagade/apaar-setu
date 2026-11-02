// Scholarship / fee-reimbursement cross-check against the Seat Ledger.
// Claims mirror what would come from the National Scholarship Portal (NSP) and state portals.
import { db } from '../data/store';
import { VCODES } from '../lib/constants';
import { sha } from '../lib/crypto';
import { groupBy } from '../lib/util';
import { audit } from './audit';

export const SCHEMES = {
  PRAGATI: { label: 'AICTE Pragati (girls)', amount: 50000 },
  SAKSHAM: { label: 'AICTE Saksham (PwD)', amount: 50000 },
  PGS: { label: 'AICTE PG Scholarship (GATE/GPAT)', amount: 148800 },
  SFR: { label: 'State fee reimbursement', amount: 85000 },
};

export function claimStatus(c, rules = db.rules()) {
  const ens = db.where('enrolments', (e) => e.apaarId === c.apaarId && e.academicYear === rules.academicYear);
  const here = ens.find((e) => e.institutionId === c.institutionId);
  const otherClaims = db.where('scholarships', (x) => x.apaarId === c.apaarId && x.id !== c.id && x.scheme === c.scheme);
  if (!here) return { status: 'no_seat', label: 'No seat in ledger', why: 'No enrolment for this APAAR at the claiming institution.' };
  if (here.status === 'dropped' && (!here.exitDate || here.exitDate <= c.claimDate)) return { status: 'withdrawn', label: 'Student withdrawn', why: `Student withdrew on ${here.exitDate}; claim dated ${c.claimDate}.` };
  if (here.recordState === 'on_hold') return { status: 'on_hold', label: 'Seat on hold', why: 'The seat is on hold for a duplicate-enrolment review.' };
  if (otherClaims.length) return { status: 'duplicate', label: 'Duplicate claim', why: `Same scheme also claimed via ${otherClaims.map((o) => db.get('institutions', o.institutionId)?.short || o.institutionId).join(', ')}.` };
  return { status: 'ok', label: 'Matched', why: `Seat ${here.slotLabel} in ${here.programmeCode}, ${here.recordState.replace('_', '-')}.` };
}

export function crossCheckScholarships(rules = db.rules()) {
  const results = db.all('scholarships').map((c) => ({ claim: c, ...claimStatus(c, rules) }));
  const bad = results.filter((r) => r.status !== 'ok');
  const flags = Object.entries(groupBy(bad, (r) => r.claim.institutionId + '|' + r.status)).map(([key, list]) => {
    const [iid, status] = key.split('|');
    const inst = db.get('institutions', iid);
    const amount = list.reduce((s, r) => s + (r.claim.amount || 0), 0);
    return {
      id: `F-V12-${sha(key).slice(0, 10)}`,
      code: 'V12',
      severity: VCODES.V12.severity,
      title: VCODES.V12.title,
      status: 'open',
      createdAt: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), by: 'Scholarship cross-check', action: 'created', note: '' }],
      reason: `${list.length} scholarship claim(s) worth ₹${amount.toLocaleString('en-IN')} at ${inst?.name || iid} fail the seat check: ${list[0].label.toLowerCase()}. ${list[0].why} Hold payment until the institution explains.`,
      entityType: 'scholarship',
      institutionId: iid,
      state: inst?.state,
      score: Math.min(1, list.length / 5),
      refs: { apaarIds: list.map((r) => r.claim.apaarId), enrolmentIds: [], institutionIds: [iid], claimIds: list.map((r) => r.claim.id) },
    };
  });
  return { results, flags };
}

export function setPayment(claim, paymentStatus, actor) {
  db.put('scholarships', { ...claim, paymentStatus, paymentBy: actor.name, paymentAt: new Date().toISOString() });
  audit(actor, 'SCHOLARSHIP_' + paymentStatus.toUpperCase(), 'scholarship:' + claim.id, { detail: `${claim.scheme} ₹${claim.amount}` });
}
