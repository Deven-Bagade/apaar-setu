// Public transparency figures per institution: aggregates only, small cells suppressed.
import { db } from '../data/store';
import { CATEGORIES } from '../lib/constants';
import { instMetrics } from './analytics';
import { computeTrust } from './trust';

export function computePublicStats(inst, rules = db.rules()) {
  const m = instMetrics(inst, rules);
  const t = computeTrust(inst, rules);
  const mix = {};
  Object.keys(CATEGORIES).forEach((c) => {
    const n = m.active.filter((e) => e.category === c).length;
    if (n) mix[c] = n < rules.smallCellSuppress ? '<' + rules.smallCellSuppress : n;
  });
  return {
    id: inst.id,
    aicteId: inst.aicteId,
    name: inst.name,
    city: inst.city,
    state: inst.state,
    type: inst.type,
    approvedIntake: m.intake,
    enrolled: m.active.length,
    within: m.within,
    supernumerary: m.supern,
    fillPct: m.fillPct,
    verifiedPct: m.active.length ? Math.round((m.verified / m.active.length) * 100) : 0,
    categoryMix: mix,
    programmes: m.progs.map((p) => ({ code: p.code, course: p.course, intake: p.approvedIntake, enrolled: m.active.filter((e) => e.programmeId === p.id && e.group === 'W').length })),
    trustBand: t.band.label,
    trustColor: t.band.color,
    updatedAt: new Date().toISOString(),
  };
}

export function refreshPublicStats(instId) {
  const inst = db.get('institutions', instId);
  if (inst) db.put('publicStats', computePublicStats(inst));
}

export const publicList = () => {
  const stored = db.all('publicStats');
  if (stored.length) return stored;
  return db.all('institutions').map((i) => computePublicStats(i));
};
