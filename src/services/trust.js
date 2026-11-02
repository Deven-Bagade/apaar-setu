// Institution Data Trust Score (0-100) with explainable parts and fix-it tips.
import { db } from '../data/store';
import { instMetrics, trustBand } from './analytics';

const W = { completeness: 20, verification: 25, anomalies: 25, timeliness: 15, corrections: 15 };

export function computeTrust(inst, rules = db.rules()) {
  const m = instMetrics(inst, rules);
  const act = m.active;
  const n = act.length || 1;
  const parts = [];

  const complete = act.filter((e) => e.guardian && e.phoneHash && e.email).length;
  const cRate = complete / n;
  parts.push({ key: 'completeness', label: 'Data completeness', max: W.completeness, score: Math.round(W.completeness * cRate), detail: `${Math.round(cRate * 100)}% of records have guardian, phone and email`, tip: cRate < 0.95 ? 'Fill the optional contact fields (guardian, phone, email) for all students.' : '' });

  const batches = db.where('batches', (b) => b.institutionId === inst.id);
  const attempted = batches.reduce((s, b) => s + (b.accepted || 0) + (b.rejected || 0), 0) || 1;
  const v02 = batches.reduce((s, b) => s + (b.rejectedRows || []).filter((r) => r.issues.some((x) => ['V01', 'V02'].includes(x.code))).length, 0);
  const vRate = 1 - v02 / attempted;
  parts.push({ key: 'verification', label: 'APAAR verification rate', max: W.verification, score: Math.round(W.verification * Math.max(0, vRate)), detail: `${Math.round(vRate * 100)}% of uploaded rows had a valid, matching APAAR ID`, tip: vRate < 0.97 ? 'Collect APAAR IDs from DigiLocker at the admission desk instead of typing them later.' : '' });

  const sev = { hold: 4, flag: 2, block: 1 };
  const instFlags = m.flags.filter((f) => f.entityType === 'institution');
  const penalty = m.flags.filter((f) => f.entityType !== 'institution').reduce((s, f) => s + (sev[f.severity] || 1), 0);
  const per100 = (penalty / n) * 100;
  const aScore = Math.max(0, Math.round(W.anomalies - per100 * 2.2 - instFlags.length * 8));
  parts.push({ key: 'anomalies', label: 'Open anomalies', max: W.anomalies, score: aScore, detail: `${m.flags.length} open flag(s) involving this institution`, tip: m.flags.length ? 'Resolve open flags: withdraw duplicate admissions, correct shared contact details, explain enrolment jumps.' : '' });

  const deadline = new Date(`${rules.academicYear}-09-30`);
  const sub = batches.filter((b) => b.submittedAt).map((b) => new Date(b.submittedAt));
  let tScore = 0;
  let tDetail = 'No batch submitted yet';
  if (sub.length) {
    const lateDays = Math.max(0, ...sub.map((d) => (d - deadline) / 86400000));
    tScore = Math.max(0, Math.round(W.timeliness - lateDays * 0.75));
    tDetail = lateDays > 0 ? `Last submission ${Math.round(lateDays)} day(s) after the 30 Sep deadline` : 'All batches submitted before the 30 Sep deadline';
  }
  const unsubmitted = batches.filter((b) => b.status === 'draft' && (b.accepted || 0) > 0).length;
  parts.push({ key: 'timeliness', label: 'Timeliness', max: W.timeliness, score: tScore, detail: tDetail + (unsubmitted ? `; ${unsubmitted} batch(es) still not submitted` : ''), tip: tScore < W.timeliness || unsubmitted ? 'Sign and submit batches within two weeks of admission close.' : '' });

  const rej = batches.reduce((s, b) => s + (b.rejected || 0), 0);
  const corrRate = 1 - rej / attempted;
  const declaredGap = m.declared ? Math.abs(m.declared - act.length) / Math.max(1, m.declared) : 0;
  const crScore = Math.max(0, Math.round(W.corrections * corrRate - declaredGap * 30));
  parts.push({ key: 'corrections', label: 'Accuracy and consistency', max: W.corrections, score: crScore, detail: `${rej} rejected row(s) still open${m.declared ? `; declared ${m.declared} vs verified ${act.length}` : ''}`, tip: rej || declaredGap > 0.05 ? 'Fix rejected rows from the batch fix list, and keep the approval-portal figures in line with uploaded records.' : '' });

  let score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.score, 0)));
  // Institution-level anomalies cap the score so they cannot be averaged away by good paperwork.
  let cap = null;
  if (instFlags.length >= 2) cap = 39;
  else if (instFlags.length === 1) cap = 59;
  if (cap !== null && score > cap) {
    cap = { value: cap, why: `Capped at ${cap}: ${instFlags.length} open institution-level anomal${instFlags.length > 1 ? 'ies' : 'y'} (${instFlags.map((f) => f.code).join(', ')})` };
    score = cap.value;
  } else cap = null;
  return { score, band: trustBand(score), parts, cap, metrics: m };
}

let cache = { v: -1, map: new Map() };
export function trustAll(version) {
  if (cache.v === version) return cache.map;
  const map = new Map();
  db.all('institutions').forEach((i) => map.set(i.id, computeTrust(i)));
  cache = { v: version, map };
  return map;
}
