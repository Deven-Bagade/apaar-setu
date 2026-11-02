// Upload pipeline: Layer 1 (instant rules) -> Layer 2 (APAAR + Seat Ledger) -> stored record.
// Same code path serves the web form, Excel bulk upload and the REST API.
import { db, getMode, getBackend } from '../data/store';
import { CATEGORIES, VCODES, regionOfState } from '../lib/constants';
import { apaarFormatOk, ageOn } from '../lib/util';
import { encryptField, matchHash, randomId, sha, canon, signText, institutionKeys, verifyText, b64url } from '../lib/crypto';
import { mockAbc } from '../data/mockAbc';
import { checkSeat, ledgerEvent } from './ledger';
import { audit } from './audit';
import { notify } from './notify';
import { refreshPublicStats } from './publicStats';

export const TEMPLATE_COLUMNS = [
  'apaar_id', 'student_name', 'dob', 'gender', 'guardian_name', 'phone', 'bank_account', 'email', 'nationality',
  'programme_code', 'category', 'proof_ref', 'admission_date', 'admission_mode', 'institution_student_id',
];
export const COLUMN_HELP = {
  apaar_id: '12-digit APAAR ID from DigiLocker / ABC',
  student_name: 'As in APAAR / Aadhaar',
  dob: 'YYYY-MM-DD',
  gender: 'M, F or O',
  guardian_name: "Father's / mother's / guardian's name",
  phone: '10-digit mobile',
  bank_account: 'Optional, used for scholarship checks',
  email: 'Optional',
  nationality: 'Indian, or country name for FN / OCI',
  programme_code: 'Code shown on your Seat Ledger page',
  category: Object.keys(CATEGORIES).join(' / '),
  proof_ref: 'Required for NRI, TFW, FN, OCI, CIWGC, PMSSS, LAT',
  admission_date: 'YYYY-MM-DD',
  admission_mode: 'Counselling / Management / Institute / Lateral',
  institution_student_id: "Your college's roll / registration number",
};

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s));

// Normalises keys coming from Excel (spaces, case) and values (dates as numbers).
export function normaliseRow(raw) {
  const r = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (k.startsWith('__')) return;
    const key = String(k).trim().toLowerCase().replace(/[\s-]+/g, '_');
    let val = v;
    if (typeof val === 'number' && (key === 'dob' || key === 'admission_date') && val > 20000 && val < 80000) {
      val = new Date(Math.round((val - 25569) * 86400000)).toISOString().slice(0, 10);
    }
    if (val instanceof Date) val = `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
    r[key] = val === undefined || val === null ? '' : String(val).trim();
  });
  if (r.apaar_id) r.apaar_id = r.apaar_id.replace(/\s/g, '');
  if (r.category) r.category = r.category.toUpperCase();
  if (r.gender) r.gender = r.gender.toUpperCase().slice(0, 1);
  if (r.programme_code) r.programme_code = r.programme_code.toUpperCase();
  return r;
}

export const programmesOf = (instId, year = db.rules().academicYear) => db.where('programmes', (p) => p.institutionId === instId && p.academicYear === year);

// ---- Layer 1: instant rules (also runs in the browser before upload) ----
export function layer1(row, ctx) {
  const issues = [];
  const add = (code, field, msg) => issues.push({ code, field, msg, severity: VCODES[code].severity });
  if (!row.apaar_id) add('V01', 'apaar_id', 'APAAR ID is missing.');
  else if (!/^\d{12}$/.test(row.apaar_id)) add('V01', 'apaar_id', 'APAAR ID must be exactly 12 digits.');
  else if (!apaarFormatOk(row.apaar_id)) add('V01', 'apaar_id', 'Checksum digit is wrong; this is not a valid APAAR ID (likely a typo).');

  if (!row.student_name || row.student_name.length < 3) add('V08', 'student_name', 'Student name is missing.');
  if (!isDate(row.dob)) add('V08', 'dob', 'Date of birth must be YYYY-MM-DD.');
  else {
    const age = ageOn(row.dob, new Date(row.admission_date || Date.now()));
    if (age < 15 || age > 60) add('V08', 'dob', `Age at admission is ${age}; please check the date of birth.`);
  }
  if (!['M', 'F', 'O'].includes(row.gender)) add('V08', 'gender', 'Gender must be M, F or O.');
  if (row.phone && !/^[6-9]\d{9}$/.test(row.phone)) add('V08', 'phone', 'Phone must be a 10-digit Indian mobile number.');
  const prog = ctx.programmes.find((p) => p.code === row.programme_code);
  if (!prog) add('V08', 'programme_code', `Programme code "${row.programme_code || ''}" is not approved for this institution.`);
  const cat = CATEGORIES[row.category];
  if (!cat) add('V08', 'category', `Category must be one of ${Object.keys(CATEGORIES).join(', ')}.`);
  if (!isDate(row.admission_date)) add('V08', 'admission_date', 'Admission date must be YYYY-MM-DD.');
  else if (new Date(row.admission_date) > new Date(Date.now() + 86400000)) add('V08', 'admission_date', 'Admission date is in the future.');
  else if (row.admission_date < `${ctx.rules.academicYear}-05-01`) add('V08', 'admission_date', `Admission date is before the ${ctx.rules.academicYear} admission window.`);
  if (!row.institution_student_id) add('V08', 'institution_student_id', 'Institution student ID (roll number) is missing.');
  if (!row.nationality) add('V08', 'nationality', 'Nationality is missing.');

  if (cat?.proof && !row.proof_ref) add('V05', 'proof_ref', `${cat.label} needs proof: ${cat.proof}.`);
  const indian = String(row.nationality || '').toLowerCase() === 'indian';
  if (cat && row.nationality) {
    if (['FN', 'OCI'].includes(row.category) && indian) add('V09', 'nationality', `${cat.label} students cannot have Indian nationality.`);
    if (['REG', 'NRI', 'TFW', 'PMSSS', 'CIWGC', 'LAT'].includes(row.category) && !indian) add('V09', 'category', 'Non-Indian nationals must be admitted under FN or OCI/PIO.');
  }
  if (cat && prog && row.category === 'LAT' && !ctx.rules.lateralLevels.includes(prog.level)) add('V15', 'category', `Lateral entry is not allowed for ${prog.level} programmes.`);

  if (row.apaar_id) {
    if (ctx.seen.has(row.apaar_id)) add('V10', 'apaar_id', 'This APAAR ID appears more than once in the file.');
    const here = db.find('enrolments', (e) => e.apaarId === row.apaar_id && e.institutionId === ctx.institution.id && e.status === 'active' && e.academicYear === ctx.rules.academicYear);
    if (here) add('V10', 'apaar_id', `Already enrolled here (${here.programmeCode}, roll ${here.instStudentId}).`);
  }
  return { issues, prog };
}

// Where else is this APAAR active? Uses apaarIndex (cross-institution index without personal data).
export function activeElsewhere(apaarId, instId) {
  const idx = db.get('apaarIndex', apaarId);
  const fromIdx = (idx?.entries || []).filter((x) => x.status === 'active' && x.institutionId !== instId);
  if (fromIdx.length) return fromIdx;
  return db
    .where('enrolments', (e) => e.apaarId === apaarId && e.institutionId !== instId && e.status === 'active')
    .map((e) => ({ institutionId: e.institutionId, enrolmentId: e.id, status: e.status }));
}

export function updateApaarIndex(enrolments) {
  const byA = new Map();
  enrolments.forEach((e) => {
    const cur = byA.get(e.apaarId) || db.get('apaarIndex', e.apaarId) || { id: e.apaarId, entries: [] };
    const entries = cur.entries.filter((x) => x.enrolmentId !== e.id).concat({ institutionId: e.institutionId, enrolmentId: e.id, status: e.status });
    byA.set(e.apaarId, { id: e.apaarId, entries });
  });
  db.putMany('apaarIndex', [...byA.values()]);
}

// In Firebase mode, institution users cannot read other colleges' records, so we prefetch
// only the index entries for the APAAR IDs in this upload.
export async function prepareIndex(apaarIds) {
  if (getMode() !== 'firebase') return;
  const docs = await getBackend().fetchByIds('apaarIndex', [...new Set(apaarIds)].filter((x) => /^\d{12}$/.test(x)));
  if (docs.length) db.putLocal('apaarIndex', docs);
}

const safeRow = (r) => ({ ...r, phone: r.phone ? encryptField(r.phone) : '', bank_account: r.bank_account ? encryptField(r.bank_account) : '' });

function makeEnrolment(row, prog, inst, seat, abc, actor, batchId, held) {
  const now = new Date().toISOString();
  return {
    id: randomId('E'),
    apaarId: row.apaar_id,
    name: row.student_name,
    dob: row.dob,
    gender: row.gender,
    guardian: row.guardian_name || '',
    email: row.email || '',
    phoneEnc: encryptField(row.phone),
    phoneHash: matchHash(row.phone),
    bankEnc: encryptField(row.bank_account),
    bankHash: matchHash(row.bank_account),
    nationality: row.nationality,
    institutionId: inst.id,
    state: inst.state,
    region: regionOfState(inst.state),
    programmeId: prog.id,
    programmeCode: prog.code,
    course: prog.course,
    level: prog.level,
    academicYear: prog.academicYear,
    category: row.category,
    group: seat.group,
    slotNo: seat.slotNo,
    slotLabel: seat.label,
    admissionDate: row.admission_date,
    admissionMode: row.admission_mode || (row.category === 'LAT' ? 'Lateral' : 'Counselling'),
    instStudentId: row.institution_student_id,
    proofRef: row.proof_ref || '',
    proofHash: row.proof_ref ? sha(row.proof_ref) : '',
    status: 'active',
    semester: row.category === 'LAT' ? 3 : 1,
    recordState: held ? 'on_hold' : 'apaar_verified',
    nameScore: abc.nameScore,
    holdReason: held ? held : '',
    batchId,
    createdBy: actor?.name || 'System',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Runs the full pipeline over rows and stores the results.
 * Returns { batch, accepted, held, rejected }.
 */
export function processUpload(rawRows, { institution, actor, source = 'excel', fileName = '', batchId = null }) {
  const rules = db.rules();
  const ctx = { institution, programmes: programmesOf(institution.id, rules.academicYear), rules, seen: new Set() };
  const accepted = [];
  const held = [];
  const rejected = [];
  const events = [];
  const newFlags = [];
  const reserved = {}; // programmeId -> enrolments reserved in this run

  rawRows.forEach((raw, i) => {
    const row = normaliseRow(raw);
    const rowNo = raw.__row || i + 2;
    const { issues, prog } = layer1(row, ctx);
    if (row.apaar_id) ctx.seen.add(row.apaar_id);
    if (issues.some((x) => x.severity === 'block')) return rejected.push({ rowNo, row: safeRow(row), issues, layer: 1 });

    // Layer 2a: authoritative APAAR check against ABC
    const abc = mockAbc.verify({ apaarId: row.apaar_id, name: row.student_name, dob: row.dob });
    if (!abc.found) return rejected.push({ rowNo, row: safeRow(row), issues: [{ code: 'V02', field: 'apaar_id', msg: 'APAAR ID not found in the ABC registry.', severity: 'block' }], layer: 2 });
    if (!abc.dobMatch || abc.nameScore < rules.nameMatchMin) {
      const why = !abc.dobMatch ? 'date of birth does not match ABC' : `name match only ${Math.round(abc.nameScore * 100)}% (ABC has "${abc.registryName}")`;
      return rejected.push({ rowNo, row: safeRow(row), issues: [{ code: 'V02', field: !abc.dobMatch ? 'dob' : 'student_name', msg: `APAAR found, but ${why}.`, severity: 'block' }], layer: 2 });
    }
    // Layer 2b: Seat Ledger
    const seat = checkSeat(prog, row.category, reserved[prog.id] || [], rules);
    if (!seat.ok) {
      events.push(ledgerEvent('BLOCKED', { ...row, apaarId: row.apaar_id, name: row.student_name, category: row.category, state: institution.state }, prog, actor, seat.reason));
      return rejected.push({ rowNo, row: safeRow(row), issues: [{ code: 'V03', field: 'category', msg: seat.reason, severity: 'block' }], layer: 2 });
    }
    // Layer 2c: cross-institution check -> hold for review
    const elsewhere = activeElsewhere(row.apaar_id, institution.id);
    const holdMsg = elsewhere.length ? `Active at ${elsewhere.map((x) => db.get('institutions', x.institutionId)?.name || x.institutionId).join(', ')}` : '';
    const e = makeEnrolment(row, prog, institution, seat, abc, actor, null, holdMsg);
    (reserved[prog.id] = reserved[prog.id] || []).push(e);
    events.push(ledgerEvent(holdMsg ? 'HOLD' : 'OCCUPY', { ...e, at: e.createdAt }, prog, actor, holdMsg));
    if (holdMsg) {
      held.push(e);
      newFlags.push(dupFlag(e, elsewhere));
    } else accepted.push(e);
  });

  let batch;
  db.tx(() => {
    const existing = batchId ? db.get('batches', batchId) : null;
    const id = existing?.id || randomId('B');
    const all = accepted.concat(held);
    all.forEach((e) => (e.batchId = id));
    batch = {
      id,
      institutionId: institution.id,
      state: institution.state,
      region: regionOfState(institution.state),
      source,
      fileName: existing?.fileName || fileName,
      by: existing?.by || actor?.name,
      byId: existing?.byId || actor?.id,
      at: existing?.at || new Date().toISOString(),
      // New records in an already submitted batch need a fresh signature, so it goes back to draft.
      status: existing && !all.length ? existing.status : 'draft',
      total: (existing?.total || 0) + (existing ? 0 : rawRows.length),
      enrolmentIds: (existing?.enrolmentIds || []).concat(all.map((e) => e.id)),
      rejectedRows: rejected.concat(existing ? (existing.rejectedRows || []).filter((r) => !rawRows.some((x) => x.__fixOf === r.rowNo)) : []),
      lastRunAt: new Date().toISOString(),
    };
    batch.accepted = batch.enrolmentIds.length;
    batch.rejected = batch.rejectedRows.length;
    batch.held = db.where('enrolments', (x) => batch.enrolmentIds.includes(x.id) && x.recordState === 'on_hold').length + held.length;
    db.putMany('enrolments', all);
    db.putMany('ledger', events);
    if (newFlags.length) db.putMany('flags', newFlags);
    db.put('batches', batch);
    updateApaarIndex(all);
  });

  const codes = {};
  rejected.forEach((r) => r.issues.forEach((x) => (codes[x.code] = (codes[x.code] || 0) + 1)));
  const codeText = Object.entries(codes).map(([c, n]) => `${n} × ${c} (${VCODES[c].title})`).join('; ');
  notify(
    institution.id,
    `APAAR-Setu: ${batchId ? 'Re-check' : 'Upload'} of ${rawRows.length} record(s) done. Accepted ${accepted.length}, on hold ${held.length}, rejected ${rejected.length}.${codeText ? ' Rejections: ' + codeText + '.' : ''} Open the batch to fix and resubmit.`,
    { title: 'Upload result', link: '/app/batches/' + batch.id },
  );
  audit(actor, batchId ? 'BATCH_RECHECK' : 'BATCH_UPLOAD', 'batch:' + batch.id, { detail: `${source}: ${accepted.length} accepted, ${held.length} held, ${rejected.length} rejected`, after: { n: batch.accepted, r: batch.rejected } });
  return { batch, accepted, held, rejected };
}

function dupFlag(e, elsewhere) {
  const insts = elsewhere.map((x) => x.institutionId);
  const allInsts = [...new Set([e.institutionId, ...insts])].sort();
  return {
    id: 'F-V04-' + sha(e.apaarId + allInsts.join()).slice(0, 10),
    code: 'V04',
    severity: 'hold',
    title: VCODES.V04.title,
    reason: `APAAR ${e.apaarId} (${e.name}) was uploaded by ${db.get('institutions', e.institutionId)?.name} while still active at ${insts.map((i) => db.get('institutions', i)?.name || i).join(', ')}. One of the two admissions must be withdrawn or the student must be transferred.`,
    entityType: 'enrolment',
    institutionId: e.institutionId,
    state: e.state,
    refs: { apaarIds: [e.apaarId], enrolmentIds: [e.id, ...elsewhere.map((x) => x.enrolmentId)], institutionIds: [e.institutionId, ...insts] },
    score: 1,
    status: 'open',
    createdAt: new Date().toISOString(),
    history: [{ at: new Date().toISOString(), by: 'Validation engine', action: 'created', note: 'Held at upload (Layer 2)' }],
  };
}

// Institution admin signs the batch with the college key and submits it to AICTE.
export function submitBatch(batchId, actor) {
  const b = db.get('batches', batchId);
  if (!b) throw new Error('Batch not found');
  const ens = db.where('enrolments', (e) => b.enrolmentIds.includes(e.id) && e.status === 'active');
  const ready = ens.filter((e) => e.recordState === 'apaar_verified');
  const payload = canon(ens.map((e) => ({ id: e.id, a: e.apaarId, p: e.programmeId, c: e.category, s: e.slotNo })).sort((x, y) => x.id.localeCompare(y.id)));
  const payloadHash = sha(payload);
  const keys = institutionKeys(b.institutionId);
  const signature = signText(payloadHash, keys.secretKey);
  db.tx(() => {
    db.putMany('enrolments', ready.map((e) => ({ ...e, recordState: 'ledger_accepted', updatedAt: new Date().toISOString() })));
    db.put('batches', { ...b, status: 'submitted', submittedAt: new Date().toISOString(), submittedBy: actor.name, payloadHash, signature, signerKey: b64url(keys.publicKey) });
  });
  const inst = db.get('institutions', b.institutionId);
  notify(regionOfState(inst.state), `${inst.name} submitted batch ${b.id.slice(0, 8)} with ${ready.length} record(s) for AICTE verification.`, { title: 'Batch submitted', link: '/app/batches/' + b.id });
  notify('AICTE', `${inst.name} submitted a signed batch (${ready.length} records).`, { title: 'Batch submitted', link: '/app/batches/' + b.id });
  audit(actor, 'BATCH_SUBMIT', 'batch:' + b.id, { detail: `Signed with institution key, ${ready.length} records`, after: { payloadHash } });
  refreshPublicStats(b.institutionId);
  return ready.length;
}

export function verifyBatchSignature(b) {
  if (!b?.signature) return { ok: false, reason: 'Not signed yet' };
  const keys = institutionKeys(b.institutionId);
  const ens = db.where('enrolments', (e) => b.enrolmentIds.includes(e.id) && (e.status === 'active' || e.updatedAt <= b.submittedAt));
  const ok = verifyText(b.payloadHash, b.signature, keys.publicKey);
  const sigKeyOk = b.signerKey === b64url(keys.publicKey);
  return { ok: ok && sigKeyOk, records: ens.length, reason: ok ? 'Signature valid for the submitted payload hash' : 'Signature does not match' };
}

// AICTE / regional officer verifies the batch: records become AICTE-verified.
export function verifyBatch(batchId, actor) {
  const b = db.get('batches', batchId);
  const sig = verifyBatchSignature(b);
  if (!sig.ok) throw new Error('Signature check failed: ' + sig.reason);
  const ens = db.where('enrolments', (e) => b.enrolmentIds.includes(e.id) && e.recordState === 'ledger_accepted');
  db.tx(() => {
    db.putMany('enrolments', ens.map((e) => ({ ...e, recordState: 'aicte_verified', verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })));
    db.put('batches', { ...b, status: 'verified', verifiedAt: new Date().toISOString(), verifiedBy: actor.name });
  });
  notify(b.institutionId, `AICTE verified batch ${b.id.slice(0, 8)}: ${ens.length} record(s) are now AICTE-verified. Students can now download their enrolment credential.`, { title: 'Batch verified' });
  ens.forEach((e) => notify('apaar:' + e.apaarId, `Your admission to ${e.course} at ${db.get('institutions', e.institutionId)?.name} is verified by AICTE. Your enrolment credential is ready in APAAR-Setu.`, { title: 'Admission verified', channel: 'sms' }));
  audit(actor, 'BATCH_VERIFY', 'batch:' + b.id, { detail: `${ens.length} records AICTE-verified` });
  refreshPublicStats(b.institutionId);
  return ens.length;
}

// Correction of an existing record (re-runs the identity check).
export function updateEnrolment(e, changes, actor) {
  const next = { ...e, ...changes, updatedAt: new Date().toISOString() };
  if (changes.phone !== undefined) {
    next.phoneEnc = encryptField(changes.phone);
    next.phoneHash = matchHash(changes.phone);
    delete next.phone;
  }
  if (changes.bank !== undefined) {
    next.bankEnc = encryptField(changes.bank);
    next.bankHash = matchHash(changes.bank);
    delete next.bank;
  }
  const abc = mockAbc.verify({ apaarId: next.apaarId, name: next.name, dob: next.dob });
  if (!abc.found || !abc.dobMatch || abc.nameScore < db.rules().nameMatchMin) throw new Error('V02: the corrected name / DOB does not match the ABC registry.');
  next.nameScore = abc.nameScore;
  if (['ledger_accepted', 'aicte_verified'].includes(e.recordState)) next.recordState = 'apaar_verified';
  db.put('enrolments', next);
  audit(actor, 'RECORD_CORRECT', 'enrolment:' + e.id, { before: e, after: next, detail: Object.keys(changes).join(', ') + ' changed' });
  return next;
}
