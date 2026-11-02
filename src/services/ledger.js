// Seat Ledger: approved intake becomes numbered, typed seat slots.
// A student can only enter the system by occupying a free slot of the right pool.
import { db } from '../data/store';
import { CATEGORIES, GROUPS } from '../lib/constants';
import { randomId } from '../lib/crypto';

export function capacity(prog, rules = db.rules()) {
  const n = Number(prog.approvedIntake) || 0;
  const lateralOk = rules.lateralLevels.includes(prog.level);
  return {
    W: n,
    T: Math.ceil((n * rules.tfwPct) / 100),
    F: Math.ceil((n * rules.fnPoolPct) / 100),
    P: Number(rules.pmsssAbs) || 0,
    L: lateralOk ? Math.ceil((n * rules.lateralPct) / 100) : 0,
    nriCap: Math.floor((n * rules.nriSubCapPct) / 100),
  };
}

// Enrolments that currently hold a seat in a programme (current academic year).
export const holders = (programmeId, rules = db.rules()) =>
  db.where('enrolments', (e) => e.programmeId === programmeId && e.academicYear === rules.academicYear && e.status === 'active');

export function occupancy(prog, rules = db.rules(), extra = []) {
  const cap = capacity(prog, rules);
  const list = holders(prog.id, rules).concat(extra);
  const used = { W: 0, T: 0, F: 0, P: 0, L: 0, NRI: 0 };
  list.forEach((e) => {
    used[e.group] = (used[e.group] || 0) + 1;
    if (e.category === 'NRI') used.NRI++;
  });
  return { cap, used, list };
}

export const slotLabel = (group, n) => `${GROUPS[group].prefix}-${String(n).padStart(2, '0')}`;

// Decide whether a category has a free slot, given seats already taken in this batch (`extra`).
export function checkSeat(prog, category, extra = [], rules = db.rules()) {
  const cat = CATEGORIES[category];
  if (!cat) return { ok: false, reason: 'Unknown category' };
  const { cap, used, list } = occupancy(prog, rules, extra);
  const g = cat.group;
  if (used[g] >= cap[g]) {
    const hint = g === 'W' ? ' Regular seats are full. If the student qualifies for a supernumerary scheme (TFW, FN/OCI, PMSSS, lateral), choose it and attach proof.' : '';
    return { ok: false, group: g, reason: `All ${cap[g]} ${GROUPS[g].label} slots are occupied.${hint}` };
  }
  if (category === 'NRI' && used.NRI >= cap.nriCap) return { ok: false, group: g, reason: `NRI sub-cap of ${cap.nriCap} seats reached.` };
  const taken = new Set(list.filter((e) => e.group === g).map((e) => e.slotNo));
  let n = 1;
  while (taken.has(n)) n++;
  return { ok: true, group: g, slotNo: n, label: slotLabel(g, n) };
}

export function ledgerEvent(action, e, prog, actor, note = '') {
  return {
    id: randomId('L'),
    action, // OCCUPY | VACATE | BLOCKED | HOLD | RELEASE
    programmeId: prog.id,
    institutionId: prog.institutionId,
    state: e.state || prog.state,
    category: e.category,
    group: e.group || CATEGORIES[e.category]?.group,
    slotNo: e.slotNo || null,
    slotLabel: e.slotNo ? slotLabel(e.group, e.slotNo) : '',
    apaarId: e.apaarId || '',
    name: e.name || '',
    at: e.at || new Date().toISOString(),
    by: actor?.name || 'System',
    note,
  };
}

// Day-by-day occupancy replay for a programme, built from ledger events.
export function replay(programmeId) {
  const evs = db.where('ledger', (l) => l.programmeId === programmeId).sort((a, b) => a.at.localeCompare(b.at));
  const byDay = new Map();
  let occ = 0;
  let blocked = 0;
  evs.forEach((ev) => {
    if (ev.action === 'OCCUPY') occ++;
    if (ev.action === 'VACATE') occ--;
    if (ev.action === 'BLOCKED') blocked++;
    byDay.set(ev.at.slice(0, 10), { day: ev.at.slice(0, 10), occupied: occ, blocked });
  });
  return { events: evs, series: [...byDay.values()] };
}

export function slotGrid(prog, rules = db.rules()) {
  const { cap, list } = occupancy(prog, rules);
  const byGroup = {};
  Object.keys(GROUPS).forEach((g) => {
    const slots = [];
    for (let i = 1; i <= cap[g]; i++) slots.push({ no: i, label: slotLabel(g, i), holder: null });
    list.filter((e) => e.group === g).forEach((e) => {
      const s = slots[e.slotNo - 1];
      if (s) s.holder = e;
      else slots.push({ no: e.slotNo, label: slotLabel(g, e.slotNo), holder: e, over: true });
    });
    byGroup[g] = slots;
  });
  return byGroup;
}
