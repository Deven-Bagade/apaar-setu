// Student lifecycle: withdrawal, transfer, semester promotion, graduation, and dropout early warning.
import { db } from '../data/store';
import { ledgerEvent } from './ledger';
import { audit } from './audit';
import { notify } from './notify';
import { updateApaarIndex } from './enrolment';
import { refreshPublicStats } from './publicStats';
import { pct } from '../lib/util';

export function changeStatus(e, status, { reason = '', date, actor }) {
  const prog = db.get('programmes', e.programmeId);
  const next = { ...e, status, exitDate: status === 'active' ? '' : date || new Date().toISOString().slice(0, 10), exitReason: reason, updatedAt: new Date().toISOString() };
  db.tx(() => {
    db.put('enrolments', next);
    if (e.status === 'active' && status !== 'active') db.put('ledger', ledgerEvent('VACATE', { ...e, at: new Date().toISOString() }, prog, actor, `${status}: ${reason}`));
    updateApaarIndex([next]);
    if (e.recordState === 'on_hold' && status !== 'active') {
      // Withdrawing a held duplicate resolves its V04 flag automatically.
      db.where('flags', (f) => f.code === 'V04' && f.status !== 'resolved' && (f.refs?.enrolmentIds || []).includes(e.id)).forEach((f) =>
        db.put('flags', { ...f, status: 'resolved', resolution: `Duplicate admission withdrawn by ${actor.name}`, history: [...(f.history || []), { at: new Date().toISOString(), by: actor.name, action: 'resolve', note: 'Auto-resolved: held record withdrawn' }] }),
      );
    }
  });
  audit(actor, 'STATUS_' + status.toUpperCase(), 'enrolment:' + e.id, { before: { status: e.status }, after: { status, reason }, detail: reason });
  notify('apaar:' + e.apaarId, `Your status at ${db.get('institutions', e.institutionId)?.name} changed to "${status}". ${reason ? 'Reason: ' + reason : ''}`, { channel: 'sms', title: 'Status changed' });
  refreshPublicStats(e.institutionId);
  return next;
}

export function promote(enrolments, actor) {
  const list = enrolments.filter((e) => e.status === 'active');
  db.putMany('enrolments', list.map((e) => ({ ...e, semester: (e.semester || 1) + 1, updatedAt: new Date().toISOString() })));
  audit(actor, 'SEMESTER_PROMOTE', 'programme:' + (list[0]?.programmeId || ''), { detail: `${list.length} students promoted` });
  return list.length;
}

// Dropout early warning per programme: compares this year's attrition with history and its trend.
export function cohortRisk(prog, rules = db.rules()) {
  const ens = db.where('enrolments', (e) => e.programmeId === prog.id && e.academicYear === rules.academicYear);
  const admitted = ens.length;
  const dropped = ens.filter((e) => e.status === 'dropped').length;
  const transferred = ens.filter((e) => e.status === 'transferred').length;
  const cur = admitted ? dropped / admitted : 0;
  const hist = (prog.history || []).filter((h) => h.admitted).sort((a, b) => a.year - b.year);
  const rates = hist.map((h) => h.dropped / h.admitted);
  const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const trend = rates.length >= 2 ? rates.at(-1) - rates[0] : 0;
  // First-semester attrition is usually ~1/3 of the year's, so scale current up.
  const projected = cur * 3;
  let risk = 0.45 * Math.min(1, projected / 0.25) + 0.35 * Math.min(1, mean / 0.2) + 0.2 * Math.max(0, Math.min(1, trend / 0.1));
  risk = Math.round(risk * 100);
  const level = risk >= 60 ? 'High' : risk >= 35 ? 'Medium' : 'Low';
  const reasons = [];
  if (projected > mean * 1.3 && cur > 0) reasons.push(`first-term withdrawals (${pct(dropped, admitted)}%) are on track to exceed the 3-year average of ${Math.round(mean * 100)}%`);
  if (trend > 0.02) reasons.push(`attrition rose from ${Math.round(rates[0] * 100)}% to ${Math.round(rates.at(-1) * 100)}% over ${rates.length} years`);
  if (mean > 0.12) reasons.push('historically high attrition');
  return { prog, admitted, dropped, transferred, cur, mean, trend, risk, level, reasons, hist };
}
