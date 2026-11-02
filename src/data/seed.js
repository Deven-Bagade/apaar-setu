// Synthetic national dataset with planted problems, so every feature has something to find.
// Planted: cross-college duplicates, twin APAAR identities, a shared phone and bank account,
// an outlier college, a declared-vs-verified gap, blocked over-intake attempts, ghost scholarship claims.
import { buildRegistry } from './mockAbc';
import { prng } from '../lib/util';
import { encryptField, matchHash, sha, canon, institutionKeys, signText, b64url, fingerprint, randomId } from '../lib/crypto';
import { DEFAULT_RULES, COURSES, CATEGORIES, regionOfState, DEMO_PASSWORD } from '../lib/constants';
import { capacity, slotLabel } from '../services/ledger';
import { makeEntry, merkleRoot } from '../services/audit';

const INST = [
  ['INS01', 'Sahyadri Institute of Technology', 'Sahyadri IT', 'Pune', 'Maharashtra', 'Engineering', [['BTCS', 60], ['BTEC', 60]]],
  ['INS02', 'Arabian Sea College of Engineering', 'Arabian Sea CE', 'Mumbai', 'Maharashtra', 'Engineering', [['BTCS', 60], ['BTME', 60]]],
  ['INS03', 'Sabarmati Institute of Management', 'Sabarmati IM', 'Ahmedabad', 'Gujarat', 'Management', [['PGDM', 60], ['MBA', 60]]],
  ['INS04', 'Narmada Engineering College', 'Narmada EC', 'Vadodara', 'Gujarat', 'Engineering', [['BTCS', 60], ['DCE', 60]]],
  ['INS05', 'Kaveri College of Engineering', 'Kaveri CE', 'Bengaluru', 'Karnataka', 'Engineering', [['BTCS', 60], ['BTEC', 60]]],
  ['INS06', 'Malnad Institute of Technology', 'Malnad IT', 'Shivamogga', 'Karnataka', 'Engineering', [['BTME', 60], ['MCA', 30]]],
  ['INS07', 'Coromandel Institute of Technology', 'Coromandel IT', 'Chennai', 'Tamil Nadu', 'Engineering', [['BTCS', 60], ['MBA', 60]]],
  ['INS08', 'Vaigai College of Engineering', 'Vaigai CE', 'Madurai', 'Tamil Nadu', 'Engineering', [['BTEC', 60], ['DCE', 30]]],
  ['INS09', 'Deccan Institute of Technology and Management', 'Deccan ITM', 'Hyderabad', 'Telangana', 'Engineering', [['BTCS', 60], ['MCA', 60]]],
  ['INS10', 'Godavari Engineering College', 'Godavari EC', 'Warangal', 'Telangana', 'Engineering', [['BTME', 60], ['BTEC', 30]]],
  ['INS11', 'Ganga Institute of Technology', 'Ganga IT', 'Lucknow', 'Uttar Pradesh', 'Engineering', [['BTCS', 60], ['MBA', 60]]],
  ['INS12', 'Yamuna College of Engineering', 'Yamuna CE', 'Agra', 'Uttar Pradesh', 'Engineering', [['BTCS', 60], ['DCE', 60]]],
  ['INS13', 'Vindhya Institute of Technology', 'Vindhya IT', 'Bhopal', 'Madhya Pradesh', 'Engineering', [['BTCS', 60], ['BTME', 30]]],
  ['INS14', 'Malwa College of Management', 'Malwa CM', 'Indore', 'Madhya Pradesh', 'Management', [['PGDM', 60], ['MCA', 30]]],
  ['INS15', 'Hooghly Institute of Technology', 'Hooghly IT', 'Kolkata', 'West Bengal', 'Engineering', [['BTCS', 60], ['BTEC', 60]]],
  ['INS16', 'Sundarban College of Engineering', 'Sundarban CE', 'Durgapur', 'West Bengal', 'Engineering', [['BTME', 60], ['MBA', 30]]],
];
const LITE = ['INS01', 'INS04', 'INS05', 'INS07', 'INS09', 'INS11', 'INS13', 'INS15'];

export const DEMO_USERS = [
  { key: 'admin', email: 'admin@aicte.demo', name: 'Dr. Anita Rao', role: 'aicte_admin', title: 'Director, Student Data Cell, AICTE' },
  { key: 'ro_west', email: 'west.ro@aicte.demo', name: 'Prakash Kulkarni', role: 'regional_officer', region: 'WRO', title: 'Regional Officer, Western Region' },
  { key: 'ro_north', email: 'north.ro@aicte.demo', name: 'Shalini Verma', role: 'regional_officer', region: 'NRO', title: 'Regional Officer, Northern Region' },
  { key: 'inst_admin', email: 'principal@sahyadri.demo', name: 'Dr. Meera Deshmukh', role: 'institution_admin', institutionId: 'INS01', title: 'Principal' },
  { key: 'clerk', email: 'clerk@sahyadri.demo', name: 'Ramesh Pawar', role: 'data_clerk', institutionId: 'INS01', title: 'Admission office' },
  { key: 'inst_admin2', email: 'director@ganga.demo', name: 'Prof. Alok Mishra', role: 'institution_admin', institutionId: 'INS11', title: 'Director' },
  { key: 'student', email: 'student@apaar.demo', name: '', role: 'student' },
  { key: 'employer', email: 'hr@navyug.demo', name: 'Kavita Shah', role: 'verifier', org: 'Navyug Infotech Pvt Ltd', orgType: 'Employer', title: 'HR Verification' },
  { key: 'regulator', email: 'officer@nba.demo', name: 'Dr. S. Iyer', role: 'verifier', org: 'National Board of Accreditation (demo)', orgType: 'Regulator', title: 'Accreditation officer' },
];

const COURSE = Object.fromEntries(COURSES.map((c) => [c.code, c]));
const REASONS = ['Joined another institution', 'Financial difficulty', 'Health reasons', 'Moved abroad', 'Personal / family reasons'];

export function buildSeed({ size = 'standard', userIds = {} } = {}) {
  const r = prng(2026);
  const reg = buildRegistry();
  const Y = DEFAULT_RULES.academicYear;
  const use = size === 'lite' ? INST.filter((x) => LITE.includes(x[0])) : INST;
  const has = (id) => use.some((x) => x[0] === id);
  const uid = (key) => userIds[key] || 'u-' + key;

  // Registry pools (twins and their sources reserved).
  const reserved = new Set(reg.twins.flatMap((t) => [t.apaarId, t.twinOf]));
  const pools = { ug: [], pg: [], fn: [] };
  reg.list.forEach((p) => {
    if (reserved.has(p.apaarId)) return;
    if (p.nationality !== 'Indian') pools.fn.push(p);
    else (p.ug ? pools.ug : pools.pg).push(p);
  });
  const take = (level, fn) => (fn ? pools.fn.shift() : level === 'PG' || level === 'PGDM' ? pools.pg.shift() || pools.ug.shift() : pools.ug.shift());

  const institutions = [];
  const programmes = [];
  const enrolments = [];
  const ledger = [];
  const batches = [];
  const day = (m, d, h = 11) => new Date(Date.UTC(Y, m - 1, d, h, r.int(0, 59))).toISOString();
  const phone = () => String(r.int(6, 9)) + String(r.int(100000000, 999999999));
  const bank = () => String(r.int(10000000000, 99999999999));

  use.forEach(([id, name, short, city, state, type, progs], k) => {
    const keys = institutionKeys(id);
    institutions.push({
      id, name, short, city, state, type, region: regionOfState(state),
      aicteId: `1-${4100000 + k * 7919 + 17}${String(k).padStart(2, '0')}`,
      established: 1985 + ((k * 7) % 30),
      keyFingerprint: fingerprint(keys.publicKey),
      publicKey: b64url(keys.publicKey),
      declared: {},
    });
    progs.forEach(([code, intake]) => {
      const c = COURSE[code];
      programmes.push({ id: `P-${id}-${code}-${Y}`, institutionId: id, state, code, course: c.course, level: c.level, years: c.years, approvedIntake: intake, academicYear: Y, shift: '1st shift', history: [] });
    });
  });
  const progOf = (iid, code) => programmes.find((p) => p.institutionId === iid && p.code === code);

  let rollSeq = 0;
  function enrol(p, inst, person, category, opts = {}) {
    const cat = CATEGORIES[category];
    const g = cat.group;
    const taken = new Set(enrolments.filter((e) => e.programmeId === p.id && e.group === g && e.status === 'active' && e.academicYear === Y).map((e) => e.slotNo));
    let slot = 1;
    while (taken.has(slot)) slot++;
    const ph = opts.phone || (r.chance(0.95) ? phone() : '');
    const bk = opts.bank || (r.chance(0.85) ? bank() : '');
    const at = opts.at || (category === 'LAT' ? day(8, r.int(1, 30)) : day(r.chance(0.5) ? 7 : 8, r.int(category === 'REG' ? 15 : 20, 30)));
    rollSeq++;
    const proof = {
      NRI: 'NRI-SPONSOR-' + r.int(10000, 99999), TFW: 'INC/' + Y + '/' + r.int(10000, 99999), FN: 'PASSPORT-' + 'KLMNPR'[r.int(0, 5)] + r.int(1000000, 9999999),
      OCI: 'OCI-A' + r.int(100000, 999999), CIWGC: 'CIWGC-EMP-' + r.int(1000, 9999), PMSSS: 'PMSSS-' + Y + '-' + r.int(1000, 9999), LAT: 'DIP-' + r.int(100000, 999999),
    }[category] || '';
    const e = {
      id: randomId('E'),
      apaarId: person.apaarId,
      name: person.name,
      dob: person.dob,
      gender: person.gender,
      guardian: person.guardian,
      email: r.chance(0.9) ? `${person.name.split(' ')[0].toLowerCase()}.${person.name.split(' ')[1].toLowerCase()}${r.int(1, 99)}@mail.example` : '',
      phoneEnc: encryptField(ph),
      phoneHash: matchHash(ph),
      bankEnc: encryptField(bk),
      bankHash: matchHash(bk),
      nationality: person.nationality,
      institutionId: inst.id,
      state: inst.state,
      region: inst.region,
      programmeId: p.id,
      programmeCode: p.code,
      course: p.course,
      level: p.level,
      academicYear: opts.year || Y,
      category,
      group: g,
      slotNo: slot,
      slotLabel: slotLabel(g, slot),
      admissionDate: at.slice(0, 10),
      admissionMode: category === 'LAT' ? 'Lateral' : category === 'NRI' ? 'Management' : r.chance(0.82) ? 'Counselling' : 'Management',
      instStudentId: `${inst.short.replace(/[^A-Z]/g, '')}${String(opts.year || Y).slice(2)}${p.code}${String(rollSeq).padStart(4, '0')}`,
      proofRef: proof,
      proofHash: proof ? sha(proof) : '',
      status: 'active',
      semester: category === 'LAT' ? 3 : 1,
      recordState: 'aicte_verified',
      nameScore: 1,
      holdReason: '',
      batchId: null,
      createdBy: 'Seed import',
      createdAt: at,
      updatedAt: at,
    };
    enrolments.push(e);
    if (e.academicYear === Y) ledger.push({ id: randomId('L'), action: opts.hold ? 'HOLD' : 'OCCUPY', programmeId: p.id, institutionId: inst.id, state: inst.state, category, group: g, slotNo: slot, slotLabel: e.slotLabel, apaarId: e.apaarId, name: e.name, at, by: 'Seed import', note: opts.hold || '' });
    return e;
  }

  // ---- Regular admissions per programme ----
  programmes.forEach((p) => {
    const inst = institutions.find((i) => i.id === p.institutionId);
    const cap = capacity(p, DEFAULT_RULES);
    const outlier = inst.id === 'INS04';
    const full = outlier || (inst.id === 'INS01' && p.code === 'BTCS');
    const fill = full ? 1 : 0.8 + r.next() * 0.16;
    const W = Math.round(p.approvedIntake * fill) - (full ? 0 : 2);
    const nri = p.level === 'PG' || p.level === 'PGDM' ? r.int(2, Math.min(5, cap.nriCap)) : r.int(0, 2);
    for (let i = 0; i < W; i++) enrol(p, inst, take(p.level), i < nri ? 'NRI' : 'REG');
    const ugish = p.level === 'UG' || p.level === 'Diploma';
    if (ugish) for (let i = 0; i < r.int(1, Math.min(3, cap.T)); i++) enrol(p, inst, take(p.level), 'TFW');
    const fnCount = outlier && p.code === 'BTCS' ? 8 : r.int(0, 2);
    for (let i = 0; i < fnCount; i++) enrol(p, inst, take(p.level, true), r.chance(0.6) ? 'FN' : 'OCI');
    if (ugish && r.chance(0.5)) enrol(p, inst, take(p.level), 'PMSSS');
    if (cap.L) for (let i = 0; i < r.int(2, Math.min(5, cap.L)); i++) enrol(p, inst, take('UG'), 'LAT');
  });

  // ---- Planted twins (one person, two APAAR IDs) ----
  const twinPairs = [['INS02', 'INS08'], ['INS03', 'INS14'], ['INS05', 'INS06'], ['INS09', 'INS10'], ['INS11', 'INS13'], ['INS15', 'INS01']];
  reg.twins.forEach((t, i) => {
    let [a, b] = twinPairs[i];
    if (!has(a) || !has(b)) [a, b] = [use[(i * 2) % use.length][0], use[(i * 2 + 3) % use.length][0]];
    const src = reg.byId.get(t.twinOf);
    const pa = programmes.find((p) => p.institutionId === a);
    const pb = programmes.filter((p) => p.institutionId === b).at(-1);
    enrol(pa, institutions.find((x) => x.id === a), src, 'REG', { at: day(8, 3 + i) });
    enrol(pb, institutions.find((x) => x.id === b), t, 'REG', { at: day(8, 12 + i) });
  });

  // ---- Shared phone across 9 students and shared bank account across 5 ----
  const SHARED_PHONE = '9876501234';
  const SHARED_BANK = '30125566778';
  const pickActive = (iid, n, skip = new Set()) => enrolments.filter((e) => e.institutionId === iid && e.category === 'REG' && !skip.has(e.id)).slice(5, 5 + n);
  const phoneGroups = has('INS12') ? [['INS11', 4], ['INS12', 3], ['INS01', 2]] : [['INS11', 4], ['INS01', 3], ['INS13', 2]];
  phoneGroups.forEach(([iid, n]) => pickActive(iid, n).forEach((e) => Object.assign(e, { phoneEnc: encryptField(SHARED_PHONE), phoneHash: matchHash(SHARED_PHONE) })));
  pickActive('INS11', 5).forEach((e, i) => i < 5 && Object.assign(e, { bankEnc: encryptField(SHARED_BANK), bankHash: matchHash(SHARED_BANK) }));

  // ---- Cross-institution duplicates (held at upload) ----
  const dupPairs = [['INS01', 'BTCS', 'INS09', 'BTCS'], ['INS11', 'BTCS', 'INS12', 'BTCS'], ['INS11', 'BTCS', 'INS12', 'BTCS'], ['INS05', 'BTEC', 'INS07', 'BTCS'], ['INS15', 'BTCS', 'INS16', 'BTME'], ['INS13', 'BTCS', 'INS10', 'BTME']].filter(([a, , b]) => has(a) && has(b));
  const heldEns = [];
  dupPairs.forEach(([a, ca, b, cb], i) => {
    const src = enrolments.filter((e) => e.programmeId === progOf(a, ca).id && e.category === 'REG')[20 + i];
    const instB = institutions.find((x) => x.id === b);
    const instA = institutions.find((x) => x.id === a);
    const holdMsg = 'Active at ' + instA.name;
    const e = enrol(progOf(b, cb), instB, { apaarId: src.apaarId, name: src.name, dob: src.dob, gender: src.gender, guardian: src.guardian, nationality: src.nationality }, 'REG', { at: day(9, 4 + i), hold: holdMsg });
    Object.assign(e, { recordState: 'on_hold', holdReason: holdMsg });
    heldEns.push(e);
  });

  // ---- Withdrawals ----
  enrolments.forEach((e) => {
    if (e.recordState === 'on_hold' || e.institutionId === 'INS04' || (e.institutionId === 'INS01' && e.programmeCode === 'BTCS')) return;
    const p = e.institutionId === 'INS11' && e.programmeCode === 'MBA' ? 0.09 : 0.03;
    if (r.chance(p)) {
      const exit = day(9, r.int(10, 28)).slice(0, 10);
      Object.assign(e, { status: 'dropped', exitDate: exit, exitReason: r.pick(REASONS) });
      ledger.push({ id: randomId('L'), action: 'VACATE', programmeId: e.programmeId, institutionId: e.institutionId, state: e.state, category: e.category, group: e.group, slotNo: e.slotNo, slotLabel: e.slotLabel, apaarId: e.apaarId, name: e.name, at: exit + 'T10:00:00.000Z', by: 'Seed import', note: 'dropped: ' + e.exitReason });
    }
  });

  // ---- Blocked over-intake attempts at Sahyadri BTCS ----
  if (has('INS01')) {
    const p = progOf('INS01', 'BTCS');
    for (let i = 0; i < 7; i++) {
      const person = take('UG');
      ledger.push({ id: randomId('L'), action: 'BLOCKED', programmeId: p.id, institutionId: 'INS01', state: 'Maharashtra', category: 'REG', group: 'W', slotNo: null, slotLabel: '', apaarId: person.apaarId, name: person.name, at: day(9, 2 + i, 15), by: 'Ramesh Pawar', note: 'All 60 Within intake slots are occupied.' });
    }
  }

  // ---- Graduated cohort (admitted 2024) for certificates ----
  ['INS01', 'INS03', 'INS07', 'INS09', 'INS11', 'INS14'].filter(has).forEach((iid) => {
    const inst = institutions.find((x) => x.id === iid);
    const p = programmes.find((x) => x.institutionId === iid && ['PG', 'PGDM'].includes(x.level)) || programmes.find((x) => x.institutionId === iid);
    for (let i = 0; i < 12; i++) {
      const ug = p.level === 'UG';
      const e = enrol(p, inst, take('PG'), 'REG', { year: Y - (ug ? 4 : 2), at: new Date(Date.UTC(Y - (ug ? 4 : 2), 7, 1 + i)).toISOString() });
      Object.assign(e, { status: 'graduated', exitDate: `${Y}-06-30`, exitReason: 'Programme completed', semester: ug ? 8 : 4 });
    }
  });

  // ---- History (2023-2025) per programme ----
  programmes.forEach((p) => {
    const cur = enrolments.filter((e) => e.programmeId === p.id && e.academicYear === Y).length;
    const outlier = p.institutionId === 'INS04';
    const risingMBA = p.institutionId === 'INS11' && p.code === 'MBA';
    p.history = [Y - 3, Y - 2, Y - 1].map((yr, i) => {
      const admitted = outlier ? Math.round(p.approvedIntake * (0.5 + i * 0.04)) : Math.round(cur * (0.9 + r.next() * 0.15));
      const rate = outlier ? 0 : risingMBA ? 0.06 + i * 0.06 : 0.03 + r.next() * 0.07;
      return { year: yr, admitted, dropped: Math.round(admitted * rate) };
    });
  });

  // ---- Batches ----
  const iById = Object.fromEntries(institutions.map((i) => [i.id, i]));
  institutions.forEach((inst) => {
    const mine = enrolments.filter((e) => e.institutionId === inst.id && e.academicYear === Y);
    const late = inst.id === 'INS01' ? mine.filter((e) => e.admissionDate >= `${Y}-08-25` && e.recordState !== 'on_hold').slice(0, 8) : [];
    const lateIds = new Set(late.map((e) => e.id));
    const main = mine.filter((e) => !lateIds.has(e.id));
    const status = { INS11: 'submitted', INS16: 'submitted', INS06: 'draft' }[inst.id] || 'verified';
    const submittedAt = inst.id === 'INS11' ? day(10, 16) : day(9, 12 + (Number(inst.id.slice(3)) % 10));
    const b1 = makeBatch(inst, main, status, day(9, 8), submittedAt, inst.id === 'INS06' ? sampleRejects(inst, 'v08') : []);
    batches.push(b1);
    main.forEach((e) => {
      e.batchId = b1.id;
      if (e.recordState === 'on_hold') return;
      e.recordState = status === 'verified' ? 'aicte_verified' : status === 'submitted' ? 'ledger_accepted' : 'apaar_verified';
    });
    if (late.length) {
      const b2 = makeBatch(inst, late, 'draft', day(10, 6), null, sampleRejects(inst, 'mixed'));
      batches.push(b2);
      late.forEach((e) => Object.assign(e, { batchId: b2.id, recordState: 'apaar_verified' }));
    }
    const active = mine.filter((e) => e.status === 'active').length;
    inst.declared[Y] = inst.id === 'INS11' ? Math.round(active * 1.22) : active;
  });

  function makeBatch(inst, list, status, at, submittedAt, rejectedRows) {
    const id = randomId('B');
    const b = {
      id, institutionId: inst.id, state: inst.state, region: inst.region, source: 'excel', fileName: `admissions_${inst.short.replace(/\s/g, '_').toLowerCase()}_${status === 'draft' ? 'late' : 'main'}.xlsx`,
      by: inst.id === 'INS01' ? 'Ramesh Pawar' : 'Admission office', at, status, total: list.length + rejectedRows.length,
      enrolmentIds: list.map((e) => e.id), rejectedRows, accepted: list.length, rejected: rejectedRows.length, held: list.filter((e) => e.recordState === 'on_hold').length, lastRunAt: at,
    };
    if (status !== 'draft') {
      const payload = canon(list.filter((e) => e.status === 'active').map((e) => ({ id: e.id, a: e.apaarId, p: e.programmeId, c: e.category, s: e.slotNo })).sort((x, y) => x.id.localeCompare(y.id)));
      const keys = institutionKeys(inst.id);
      b.payloadHash = sha(payload);
      b.signature = signText(b.payloadHash, keys.secretKey);
      b.signerKey = b64url(keys.publicKey);
      b.submittedAt = submittedAt;
      b.submittedBy = inst.id === 'INS01' ? 'Dr. Meera Deshmukh' : 'Institution admin';
      if (status === 'verified') Object.assign(b, { verifiedAt: new Date(new Date(submittedAt).getTime() + 3 * 86400000).toISOString(), verifiedBy: 'Dr. Anita Rao' });
    }
    return b;
  }

  function sampleRejects(inst, kind) {
    const p = programmes.find((x) => x.institutionId === inst.id);
    const base = (person, over = {}) => ({
      apaar_id: person.apaarId, student_name: person.name, dob: person.dob, gender: person.gender, guardian_name: person.guardian,
      phone: encryptField(phone()), bank_account: '', email: '', nationality: person.nationality, programme_code: p.code, category: 'REG', proof_ref: '',
      admission_date: `${Y}-09-2${r.int(0, 8)}`, admission_mode: 'Counselling', institution_student_id: 'LATE' + r.int(100, 999), ...over,
    });
    if (kind === 'v08') {
      const a = take(p.level);
      const b = take(p.level);
      return [
        { rowNo: 14, layer: 1, row: base(a, { dob: '12/05/2006' }), issues: [{ code: 'V08', field: 'dob', msg: 'Date of birth must be YYYY-MM-DD.', severity: 'block' }] },
        { rowNo: 27, layer: 1, row: base(b, { institution_student_id: '' }), issues: [{ code: 'V08', field: 'institution_student_id', msg: 'Institution student ID (roll number) is missing.', severity: 'block' }] },
      ];
    }
    const a = take(p.level);
    const b = take(p.level);
    const c = pools.fn.shift() || take(p.level);
    const d = take(p.level);
    const e = take(p.level);
    const badId = a.apaarId.slice(0, 11) + ((Number(a.apaarId[11]) + 3) % 10);
    return [
      { rowNo: 3, layer: 1, row: base(a, { apaar_id: badId }), issues: [{ code: 'V01', field: 'apaar_id', msg: 'Checksum digit is wrong; this is not a valid APAAR ID (likely a typo).', severity: 'block' }] },
      { rowNo: 5, layer: 2, row: base(b, { student_name: 'Rohit ' + b.name.split(' ')[1] }), issues: [{ code: 'V02', field: 'student_name', msg: `APAAR found, but name match only 71% (ABC has "${b.name}").`, severity: 'block' }] },
      { rowNo: 6, layer: 1, row: base(c, { category: 'FN' }), issues: [{ code: 'V05', field: 'proof_ref', msg: 'Foreign National needs proof: Passport number.', severity: 'block' }] },
      { rowNo: 8, layer: 1, row: base(d, { category: 'FN', nationality: 'Indian', proof_ref: 'PASSPORT-K5521901' }), issues: [{ code: 'V09', field: 'nationality', msg: 'Foreign National students cannot have Indian nationality.', severity: 'block' }] },
      { rowNo: 9, layer: 2, row: base(e, { programme_code: 'BTCS' }), issues: [{ code: 'V03', field: 'category', msg: 'All 60 Within intake slots are occupied. Regular seats are full. If the student qualifies for a supernumerary scheme (TFW, FN/OCI, PMSSS, lateral), choose it and attach proof.', severity: 'block' }] },
    ];
  }

  // ---- Scholarship claims (mock NSP feed) ----
  const scholarships = [];
  const claim = (e, scheme, amount, iid, extra = {}) => scholarships.push({
    id: randomId('S'), apaarId: e.apaarId, name: e.name, scheme, amount, institutionId: iid, state: iById[iid].state,
    programmeCode: e.programmeCode || '', year: Y, claimDate: extra.claimDate || day(10, r.int(1, 20)).slice(0, 10), paymentStatus: 'pending', source: 'NSP (mock feed)',
  });
  const cur = enrolments.filter((e) => e.academicYear === Y && e.status === 'active' && e.recordState !== 'on_hold');
  cur.forEach((e) => {
    if (e.gender === 'F' && ['UG', 'Diploma'].includes(e.level) && r.chance(0.1)) claim(e, 'PRAGATI', 50000, e.institutionId);
    else if (e.level === 'PG' && r.chance(0.08)) claim(e, 'PGS', 148800, e.institutionId);
    else if (e.category === 'TFW' || r.chance(0.04)) claim(e, 'SFR', 85000, e.institutionId);
  });
  if (has('INS11')) {
    for (let i = 0; i < 8; i++) {
      const ghost = take('UG');
      claim({ ...ghost, programmeCode: 'BTCS' }, 'SFR', 85000, 'INS11');
    }
  }
  enrolments.filter((e) => e.status === 'dropped').slice(0, 3).forEach((e) => claim(e, 'SFR', 85000, e.institutionId, { claimDate: `${Y}-10-12` }));
  heldEns.slice(0, 2).forEach((e) => {
    const src = enrolments.find((x) => x.apaarId === e.apaarId && x.id !== e.id);
    claim(src, 'PRAGATI', 50000, src.institutionId);
    claim(e, 'PRAGATI', 50000, e.institutionId);
  });

  // ---- Users ----
  const studentEn = enrolments.find((e) => e.institutionId === (has('INS01') ? 'INS01' : use[0][0]) && e.programmeCode === 'BTEC' && e.category === 'REG' && e.status === 'active' && e.recordState === 'aicte_verified' && e.phoneHash !== matchHash(SHARED_PHONE)) || cur[0];
  const users = DEMO_USERS.filter((u) => !u.institutionId || has(u.institutionId)).map((u) => ({
    id: uid(u.key), email: u.email, name: u.key === 'student' ? studentEn.name : u.name, role: u.role, title: u.title || '',
    institutionId: u.institutionId || '', region: u.region || '', apaarId: u.key === 'student' ? studentEn.apaarId : '', org: u.org || '', orgType: u.orgType || '',
    pwHash: sha(DEMO_PASSWORD), demo: true, active: true, createdAt: day(6, 1),
  }));
  const U = (key) => users.find((u) => u.id === uid(key));

  // ---- Credential, consents and access log for the demo student ----
  const credentials = [];
  const consents = [];
  const accessLog = [];
  const notifications = [];
  if (studentEn) {
    const reg = U('regulator');
    const emp = U('employer');
    if (reg) {
      consents.push({ id: randomId('C'), apaarId: studentEn.apaarId, requesterId: reg.id, requesterName: reg.name, requesterOrg: reg.org, orgType: reg.orgType, purpose: 'NBA accreditation sample audit of the B.Tech programme', fields: ['name', 'programme', 'institution', 'admissionYear', 'status'], days: 30, status: 'granted', grantedFields: ['name', 'programme', 'institution', 'admissionYear', 'status'], sharedData: { name: studentEn.name, programme: studentEn.course, institution: iById[studentEn.institutionId].name, admissionYear: Y, status: 'Enrolled' }, requestedAt: day(10, 18), grantedAt: day(10, 19), expiresAt: new Date(Date.now() + 25 * 86400000).toISOString() });
      accessLog.push({ id: randomId('X'), apaarId: studentEn.apaarId, actorId: reg.id, actorName: reg.name, org: reg.org, role: 'verifier', purpose: 'NBA accreditation sample audit of the B.Tech programme', fields: ['name', 'programme', 'institution', 'admissionYear', 'status'], basis: 'Consent', at: day(10, 20) });
    }
    if (emp) {
      consents.push({ id: randomId('C'), apaarId: studentEn.apaarId, requesterId: emp.id, requesterName: emp.name, requesterOrg: emp.org, orgType: emp.orgType, purpose: 'Internship offer: confirm current enrolment', fields: ['name', 'programme', 'institution', 'status'], days: 15, status: 'pending', requestedAt: day(10, 27) });
      notifications.push({ id: randomId('N'), to: 'apaar:' + studentEn.apaarId, channel: 'whatsapp', title: 'Consent request', text: `${emp.org} (Employer) asks to see your Name, Programme, Institution, Current status for: "Internship offer: confirm current enrolment". Open APAAR-Setu > Consent to allow or deny.`, at: day(10, 27), read: false });
    }
    accessLog.push({ id: randomId('X'), apaarId: studentEn.apaarId, actorId: uid('admin'), actorName: 'Dr. Anita Rao', org: 'AICTE', role: 'aicte_admin', purpose: 'Regulatory monitoring: batch verification', fields: ['all'], basis: 'Legal basis: AICTE Act 1987 (regulatory)', at: day(9, 15) });
  }

  // ---- Notifications ----
  if (has('INS01')) notifications.push({ id: randomId('N'), to: 'INS01', channel: 'whatsapp', title: 'Upload result', text: 'APAAR-Setu: Upload of 13 record(s) done. Accepted 8, on hold 0, rejected 5. Rejections: 1 × V01, 1 × V02, 1 × V05, 1 × V09, 1 × V03. Open the batch to fix and resubmit.', at: day(10, 6), read: false });
  if (has('INS11')) notifications.push({ id: randomId('N'), to: 'AICTE', channel: 'inapp', title: 'Late submission', text: 'Ganga Institute of Technology submitted its batch on 16 Oct, after the 30 Sep deadline.', at: day(10, 16), read: false });
  notifications.push({ id: randomId('N'), to: 'WRO', channel: 'inapp', title: 'Inspection planner', text: 'Narmada Engineering College is now in the "inspect first" list (trust score below 40).', at: day(10, 20), read: false });

  // ---- apaarIndex ----
  const idx = {};
  enrolments.forEach((e) => (idx[e.apaarId] = idx[e.apaarId] || { id: e.apaarId, entries: [] }).entries.push({ institutionId: e.institutionId, enrolmentId: e.id, status: e.status }));

  // ---- Audit chain ----
  const evs = [];
  batches.forEach((b) => {
    evs.push({ at: b.at, actor: { id: 'seed', name: b.by, role: 'data_clerk' }, action: 'BATCH_UPLOAD', object: 'batch:' + b.id, detail: `excel: ${b.accepted} accepted, ${b.rejected} rejected` });
    if (b.submittedAt) evs.push({ at: b.submittedAt, actor: { id: 'seed', name: b.submittedBy, role: 'institution_admin' }, action: 'BATCH_SUBMIT', object: 'batch:' + b.id, detail: 'Signed with institution key' });
    if (b.verifiedAt) evs.push({ at: b.verifiedAt, actor: { id: uid('admin'), name: 'Dr. Anita Rao', role: 'aicte_admin' }, action: 'BATCH_VERIFY', object: 'batch:' + b.id, detail: `${b.accepted} records AICTE-verified` });
  });
  evs.sort((a, b) => a.at.localeCompare(b.at));
  const audit = [];
  let prev = 'GENESIS';
  evs.forEach((ev, i) => {
    const e = makeEntry(i + 1, prev, ev);
    audit.push(e);
    prev = e.hash;
  });
  const merkle = [...new Set(audit.map((a) => a.at.slice(0, 10)))].map((d) => {
    const list = audit.filter((a) => a.at.slice(0, 10) === d);
    return { id: d, date: d, root: merkleRoot(list.map((a) => a.hash)), count: list.length, firstSeq: list[0].seq, lastSeq: list.at(-1).seq, publishedAt: d + 'T23:59:00.000Z', by: 'System' };
  });

  return {
    users,
    institutions,
    programmes,
    enrolments,
    batches,
    ledger,
    flags: [],
    consents,
    accessLog,
    credentials,
    scholarships,
    audit,
    merkle,
    notifications,
    settings: [{ id: 'rules', ...DEFAULT_RULES }, { id: 'auditHead', seq: audit.length, hash: prev }, { id: 'revocations', ids: [] }],
    publicStats: [],
    apaarIndex: Object.values(idx),
    meta: { studentEnrolmentId: studentEn?.id },
  };
}
