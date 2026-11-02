// Institution-level metrics shared by dashboards, trust score, radar, reports and the chatbot.
import { db } from '../data/store';
import { capacity } from './ledger';
import { pct } from '../lib/util';

export function instMetrics(inst, rules = db.rules()) {
  const Y = rules.academicYear;
  const progs = db.where('programmes', (p) => p.institutionId === inst.id && p.academicYear === Y);
  const ens = db.where('enrolments', (e) => e.institutionId === inst.id && e.academicYear === Y);
  const active = ens.filter((e) => e.status === 'active');
  const intake = progs.reduce((s, p) => s + (Number(p.approvedIntake) || 0), 0);
  const within = active.filter((e) => e.group === 'W').length;
  const supern = active.filter((e) => e.group !== 'W').length;
  const fnShare = active.length ? active.filter((e) => ['FN', 'OCI'].includes(e.category)).length / active.length : 0;
  const prev = progs.reduce((s, p) => s + (p.history?.find((h) => h.year === Y - 1)?.admitted || 0), 0);
  const prevDrop = progs.reduce((s, p) => s + (p.history?.find((h) => h.year === Y - 1)?.dropped || 0), 0);
  const dropped = ens.filter((e) => e.status === 'dropped').length;
  const verified = active.filter((e) => e.recordState === 'aicte_verified').length;
  const flags = db.where('flags', (f) => (f.refs?.institutionIds || [f.institutionId]).includes(inst.id) && ['open', 'review'].includes(f.status));
  const caps = progs.map((p) => capacity(p, rules));
  return {
    inst,
    progs,
    ens,
    active,
    intake,
    within,
    supern,
    supernCap: caps.reduce((s, c) => s + c.T + c.F + c.P + c.L, 0),
    fillPct: pct(within, intake),
    fnShare,
    yoy: prev ? (active.length + dropped - prev) / prev : 0,
    prevAdmitted: prev,
    attrition: active.length + dropped ? dropped / (active.length + dropped) : 0,
    histAttrition: prev ? prevDrop / prev : 0,
    verified,
    flags,
    declared: inst.declared?.[Y] ?? null,
  };
}

export const trustBand = (s) => (s >= 80 ? { label: 'High', color: 'green' } : s >= 60 ? { label: 'Fair', color: 'yellow' } : s >= 40 ? { label: 'Watch', color: 'orange' } : { label: 'Risk', color: 'red' });
