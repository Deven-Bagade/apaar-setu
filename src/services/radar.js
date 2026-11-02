// Ghost Student Radar: cross-institution anomaly detection with an explanation for every flag.
import { db } from '../data/store';
import { VCODES } from '../lib/constants';
import { nameSimilarity, groupBy, uniq } from '../lib/util';
import { sha } from '../lib/crypto';
import { isolationForest } from '../lib/iforest';
import { instMetrics } from './analytics';
import { crossCheckScholarships } from './scholarship';
import { audit } from './audit';
import { notify } from './notify';
import { refreshPublicStats } from './publicStats';

const instName = (id) => db.get('institutions', id)?.name || id;

function mk(code, key, data) {
  return {
    id: `F-${code}-${sha(key).slice(0, 10)}`,
    code,
    severity: VCODES[code].severity,
    title: VCODES[code].title,
    status: 'open',
    createdAt: new Date().toISOString(),
    history: [{ at: new Date().toISOString(), by: 'Ghost Student Radar', action: 'created', note: '' }],
    ...data,
  };
}

export function scan(rules = db.rules()) {
  const Y = rules.academicYear;
  const active = db.where('enrolments', (e) => e.status === 'active' && e.academicYear === Y);
  const out = [];

  // V04: same APAAR active at two or more institutions.
  Object.entries(groupBy(active, (e) => e.apaarId)).forEach(([a, list]) => {
    const insts = uniq(list.map((e) => e.institutionId));
    if (insts.length < 2) return;
    out.push(mk('V04', a + insts.sort().join(), {
      reason: `${list[0].name} (APAAR ${a}) is active at ${insts.length} institutions at the same time: ${insts.map(instName).join(' and ')}. A student can hold only one seat.`,
      entityType: 'enrolment', institutionId: insts[0], state: list[0].state, score: 1,
      refs: { apaarIds: [a], enrolmentIds: list.map((e) => e.id), institutionIds: insts },
    }));
  });

  // V11: near-duplicate identities (different APAAR, same DOB, near-identical name and guardian).
  Object.values(groupBy(active, (e) => e.dob)).forEach((list) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.apaarId === b.apaarId) continue;
        const ns = nameSimilarity(a.name, b.name);
        const gs = nameSimilarity(a.guardian, b.guardian);
        if (ns >= rules.fuzzyDupMin && gs >= 0.85) {
          const score = Math.round(((ns + gs) / 2) * 100) / 100;
          out.push(mk('V11', [a.apaarId, b.apaarId].sort().join(), {
            reason: `"${a.name}" (${instName(a.institutionId)}) and "${b.name}" (${instName(b.institutionId)}) share date of birth ${a.dob} and guardian "${a.guardian}", with ${Math.round(ns * 100)}% name similarity after transliteration folding, but hold different APAAR IDs (${a.apaarId}, ${b.apaarId}). Possibly one person with two APAAR IDs.`,
            entityType: 'enrolment', institutionId: a.institutionId, state: a.state, score,
            refs: { apaarIds: [a.apaarId, b.apaarId], enrolmentIds: [a.id, b.id], institutionIds: uniq([a.institutionId, b.institutionId]) },
          }));
        }
      }
    }
  });

  // V06: one phone or bank account shared by many students.
  [['phoneHash', 'phone number'], ['bankHash', 'bank account']].forEach(([field, label]) => {
    Object.entries(groupBy(active.filter((e) => e[field]), (e) => e[field])).forEach(([h, list]) => {
      if (list.length <= rules.sharedContactMax) return;
      const insts = uniq(list.map((e) => e.institutionId));
      out.push(mk('V06', field + h, {
        reason: `One ${label} is registered for ${list.length} different students across ${insts.length} institution(s) (${insts.map(instName).join(', ')}). Limit is ${rules.sharedContactMax}. This is a common sign of dummy admissions or scholarship diversion.`,
        entityType: 'contact', institutionId: insts[0], state: list[0].state, score: Math.min(1, list.length / 10),
        refs: { apaarIds: list.map((e) => e.apaarId), enrolmentIds: list.map((e) => e.id), institutionIds: insts, contactHash: h, contactType: label },
      }));
    });
  });

  // Institution-level checks.
  const insts = db.all('institutions');
  const ms = insts.map((i) => instMetrics(i, rules));
  ms.forEach((m) => {
    if (m.prevAdmitted && m.yoy * 100 > rules.yoyJumpPct) {
      out.push(mk('V07', m.inst.id + Y, {
        reason: `${m.inst.name} admitted ${m.active.length + m.ens.filter((e) => e.status === 'dropped').length} students in ${Y} against ${m.prevAdmitted} in ${Y - 1} (+${Math.round(m.yoy * 100)}%), above the ${rules.yoyJumpPct}% threshold, without any increase in approved intake.`,
        entityType: 'institution', institutionId: m.inst.id, state: m.inst.state, score: Math.min(1, m.yoy),
        refs: { institutionIds: [m.inst.id], apaarIds: [], enrolmentIds: [] },
      }));
    }
    if (m.declared && Math.abs(m.declared - m.active.length) / m.declared * 100 > rules.declaredGapPct) {
      out.push(mk('V13', m.inst.id + Y + 'gap', {
        reason: `${m.inst.name} declared ${m.declared} enrolled students in the approval portal, but only ${m.active.length} verified student records exist (${Math.round(((m.declared - m.active.length) / m.declared) * 100)}% gap).`,
        entityType: 'institution', institutionId: m.inst.id, state: m.inst.state, score: Math.min(1, Math.abs(m.declared - m.active.length) / m.declared),
        refs: { institutionIds: [m.inst.id], apaarIds: [], enrolmentIds: [] },
      }));
    }
  });

  // V14: Isolation Forest over institution features.
  const feats = ms.map((m) => [m.fillPct / 100, m.fnShare, m.yoy, m.attrition, m.histAttrition]);
  const scores = isolationForest(feats);
  ms.forEach((m, i) => {
    if (scores[i] < rules.outlierScoreMin) return;
    const why = [];
    if (m.fillPct >= 99) why.push(`${m.fillPct}% of regular seats filled`);
    if (m.attrition === 0 && m.histAttrition === 0) why.push('zero withdrawals this year and last year');
    if (m.fnShare > 0.08) why.push(`${Math.round(m.fnShare * 100)}% foreign / OCI students`);
    if (m.yoy > 0.3) why.push(`+${Math.round(m.yoy * 100)}% admissions year on year`);
    out.push(mk('V14', m.inst.id + Y + 'if', {
      reason: `${m.inst.name} has an anomaly score of ${scores[i]} (Isolation Forest, 5 features). Unusual pattern: ${why.join(', ') || 'combination of fill rate, attrition and category mix differs from peers'}.`,
      entityType: 'institution', institutionId: m.inst.id, state: m.inst.state, score: scores[i],
      refs: { institutionIds: [m.inst.id], apaarIds: [], enrolmentIds: [] },
    }));
  });

  out.push(...crossCheckScholarships(rules).flags);
  return { flags: out, instScores: Object.fromEntries(ms.map((m, i) => [m.inst.id, scores[i]])) };
}

// Runs the scan and merges results without re-opening flags people already resolved.
export function runRadar(actor, { silent = false } = {}) {
  const { flags, instScores } = scan();
  const existing = new Map(db.all('flags').map((f) => [f.id, f]));
  const merged = flags.map((f) => {
    const old = existing.get(f.id);
    return old ? { ...f, status: old.status, history: old.history, createdAt: old.createdAt, assignedTo: old.assignedTo, resolution: old.resolution } : f;
  });
  const fresh = merged.filter((f) => !existing.has(f.id));
  db.tx(() => {
    db.putMany('flags', merged);
    db.put('settings', { id: 'radar', lastRunAt: new Date().toISOString(), lastRunBy: actor?.name || 'System', found: merged.length, fresh: fresh.length, instScores });
  });
  if (!silent) {
    const byInst = groupBy(fresh, (f) => f.institutionId);
    Object.entries(byInst).forEach(([iid, list]) => notify(iid, `Ghost Student Radar raised ${list.length} new flag(s) on your records: ${uniq(list.map((f) => f.code)).join(', ')}. Please review in Flags.`, { title: 'New flags' }));
    audit(actor, 'RADAR_RUN', 'radar', { detail: `${merged.length} flags (${fresh.length} new)` });
    db.all('institutions').forEach((i) => refreshPublicStats(i.id));
  }
  return { total: merged.length, fresh: fresh.length };
}

export function resolveFlag(flag, action, note, actor) {
  const status = action === 'resolve' ? 'resolved' : action === 'dismiss' ? 'dismissed' : action === 'review' ? 'review' : 'open';
  const next = { ...flag, status, resolution: note || flag.resolution, assignedTo: action === 'review' ? actor.name : flag.assignedTo, history: [...(flag.history || []), { at: new Date().toISOString(), by: actor.name, action, note }] };
  db.put('flags', next);
  if (action === 'review') {
    notify(flag.institutionId, `Flag ${flag.code} on your institution is under review by ${actor.name}. Note: ${note || '—'}`, { title: 'Flag under review' });
  }
  audit(actor, 'FLAG_' + action.toUpperCase(), 'flag:' + flag.id, { detail: note || '' });
  return next;
}

// Graph for the Radar view: students, institutions, phones and bank accounts as nodes.
export function graphFor(flagList) {
  const nodes = new Map();
  const links = [];
  const add = (id, data) => nodes.has(id) || nodes.set(id, { id, ...data });
  flagList.forEach((f) => {
    const ens = (f.refs?.enrolmentIds || []).map((id) => db.get('enrolments', id)).filter(Boolean);
    ens.forEach((e) => {
      add('S' + e.apaarId, { kind: 'student', label: e.name, sub: e.apaarId });
      add('I' + e.institutionId, { kind: 'institution', label: db.get('institutions', e.institutionId)?.short || e.institutionId });
      links.push({ source: 'S' + e.apaarId, target: 'I' + e.institutionId, kind: 'enrolled' });
      if (f.code === 'V06') {
        const key = (f.refs.contactType === 'phone number' ? 'P' : 'K') + f.refs.contactHash;
        add(key, { kind: f.refs.contactType === 'phone number' ? 'phone' : 'bank', label: f.refs.contactType === 'phone number' ? 'Shared phone' : 'Shared bank a/c', sub: f.refs.contactHash.slice(0, 6) });
        links.push({ source: 'S' + e.apaarId, target: key, kind: 'contact', flag: true });
      }
    });
    if (f.code === 'V11' && ens.length === 2) links.push({ source: 'S' + ens[0].apaarId, target: 'S' + ens[1].apaarId, kind: 'similar', flag: true });
    if (f.code === 'V04') ens.forEach((e) => links.forEach((l) => l.source === 'S' + e.apaarId && (l.flag = true)));
  });
  const uniqLinks = new Map(links.map((l) => [l.source + l.target + l.kind, l]));
  return { nodes: [...nodes.values()], links: [...uniqLinks.values()] };
}
