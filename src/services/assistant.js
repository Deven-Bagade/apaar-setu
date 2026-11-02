// Setu Sahayak: on-device assistant. Answers "how do I…" questions about the website and
// plain-language data questions over the data the signed-in user is allowed to see.
// Runs fully in the browser (no paid AI API). Individual rows are never returned to verifiers or the public.
import { db } from '../data/store';
import { visibleInstitutions, visibleEnrolments, visibleFlags } from '../data/scope';
import { VCODES, CATEGORIES, ROLES, ALL_STATES, REGIONS } from '../lib/constants';
import { countBy, groupBy } from '../lib/util';
import { computeTrust } from './trust';
import { occupancy } from './ledger';
import { claimStatus } from './scholarship';
import { cohortRisk } from './lifecycle';
import { effectiveStatus } from './consent';

const FAQ = [
  { k: ['upload', 'excel', 'bulk', 'add student', 'add students', 'template', 'import'], roles: ['institution_admin', 'data_clerk'], a: 'To add students: open Upload → Excel bulk upload. Download the template, fill one row per student (APAAR ID, name, DOB, programme code, category…), and drop the file back. The page checks every row before sending, then the server checks APAAR with ABC and the Seat Ledger. For one student use the "Single student" tab.', to: [['Open Upload', '/app/upload']] },
  { k: ['reject', 'rejected', 'fix', 'correct row', 'error row', 'fix list'], roles: ['institution_admin', 'data_clerk'], a: 'Rejected rows stay inside their batch. Open Batches → the batch → "Rejected rows". Each row shows the reason code (e.g. V02 = name/DOB does not match ABC). Edit the cells in place and click "Re-check fixed rows". You can also download the fix list as Excel.', to: [['Open Batches', '/app/batches']] },
  { k: ['submit', 'sign', 'signature', 'send to aicte'], roles: ['institution_admin', 'data_clerk'], a: 'Only the Institution Admin can submit. Open Batches → a Draft batch → "Sign & submit to AICTE". The batch is signed with your college key so AICTE can prove which college sent which records. Data clerks prepare batches but cannot submit.', to: [['Open Batches', '/app/batches']] },
  { k: ['seat ledger', 'ledger', 'slot', 'intake', 'seat'], a: 'The Seat Ledger turns approved intake into numbered seat slots: W (within intake), T (TFW), F (FN/OCI/PIO/CIWGC), P (PMSSS) and L (lateral). A student can only be uploaded by occupying a free slot, so admissions beyond intake are blocked at upload, not discovered later.', to: [['Open Seat Ledger', '/app/ledger']] },
  { k: ['supernumerary', 'tfw', 'fee waiver', 'pmsss', 'lateral', 'nri', 'oci', 'foreign', 'fn '], a: 'Supernumerary seats are over and above approved intake and have their own caps: TFW 5% of intake, FN/OCI/PIO/CIWGC pool 15%, PMSSS a fixed number, lateral entry 10% (UG/Diploma). NRI seats are within intake with a 15% sub-cap. Each needs a proof document reference. AICTE can change these caps in Rules & settings.', to: [['Rules & settings', '/app/rules']] },
  { k: ['apaar', 'get apaar', 'where apaar', 'create apaar', 'what is apaar'], a: 'APAAR is the 12-digit "One Nation One Student ID". Students create it in DigiLocker or on abc.gov.in. In this platform it is the unique key of every record; the last digit is a checksum, so typos are caught instantly (code V01).' },
  { k: ['verify', 'qr', 'scan', 'certificate genuine', 'fake', 'check certificate'], a: 'Open "Verify a credential" (no login needed). Scan the QR on the certificate, upload a photo of it, or paste the link. The signature is checked in your browser with AICTE’s public key, so it works even offline. Only the details the student chose to share are shown.', to: [['Verify a credential', '/verify']] },
  { k: ['selective', 'disclosure', 'share only', 'hide', 'qr share'], roles: ['student'], a: 'In My credentials, tick only the details you want to share (e.g. name, programme, status). The QR and link carry only those, plus a proof that they belong to your AICTE-signed credential. Hidden details cannot be seen by the verifier.', to: [['My credentials', '/app/credentials']] },
  { k: ['consent', 'allow', 'deny', 'revoke', 'permission'], a: 'Employers and other verifiers must ask the student. The student sees the request under Consent, can untick fields, allow for a fixed number of days, deny, or revoke later. Every view is logged under "Who viewed my data".', to: [['Consent', '/app/consent']] },
  { k: ['who viewed', 'access log', 'viewed my'], roles: ['student'], a: 'Open "Who viewed my data". It lists every regulator or employer access with purpose, fields and legal basis.', to: [['Who viewed my data', '/app/access']] },
  { k: ['request access', 'request', 'employer', 'background check'], roles: ['verifier'], a: 'Open Access requests → New request. Enter the APAAR ID, choose the fields you need, write the purpose and how many days you need access. Once the student allows it, open the record from your list.', to: [['Access requests', '/app/requests']] },
  { k: ['trust score', 'trust', 'improve score', 'score'], a: 'The Institution Data Trust Score (0–100) has five parts: completeness, APAAR verification rate, open anomalies, timeliness and accuracy. Open institution-level anomalies cap it at 59 (one) or 39 (two or more). AICTE uses it to choose which colleges to inspect first.', to: [['Trust score', '/app/trust'], ['Inspection planner', '/app/inspection']] },
  { k: ['radar', 'ghost', 'how radar', 'anomaly detection', 'isolation forest'], a: 'The Ghost Student Radar checks all colleges together: same APAAR at two colleges (V04), near-identical identities with different APAAR IDs (V11, fuzzy matching with transliteration folding), one phone or bank account shared by many students (V06), sudden enrolment jumps (V07), declared-vs-verified gaps (V13), Isolation Forest outliers (V14) and scholarship claims without a seat (V12).', to: [['Open Radar', '/app/radar']] },
  { k: ['resolve flag', 'dismiss', 'flag', 'review flag'], a: 'Open Flags and click a flag. AICTE or the Regional Officer can Start review, Resolve (with a note) or Dismiss a false positive. Institutions can add a response. Withdrawing a held duplicate admission resolves its V04 flag automatically.', to: [['Open Flags', '/app/flags']] },
  { k: ['scholarship', 'nsp', 'pragati', 'saksham', 'reimbursement'], a: 'Scholarship claims (mock NSP feed) are matched to occupied seats. Claims for students with no seat, withdrawn students, duplicate claims or held seats are flagged (V12) and payment can be withheld from the Scholarships page.', to: [['Scholarships', '/app/scholarships']] },
  { k: ['report', 'nba', 'naac', 'nirf', 'export', 'excel report', 'pdf'], a: 'Reports has the AICTE compliance report, state and category summaries, the flag register, and NBA, NAAC and NIRF formats. Preview, then export to Excel / CSV or print to PDF.', to: [['Open Reports', '/app/reports']] },
  { k: ['audit', 'hash', 'chain', 'merkle', 'tamper'], a: 'Every change is appended to a hash chain: each entry stores the hash of the previous one. A daily Merkle root of the hashes is published. If anyone edits an old entry, "Verify chain" shows exactly where the chain breaks. Try "Simulate tampering" on the Audit page.', to: [['Audit trail', '/app/audit']] },
  { k: ['create user', 'add user', 'new user', 'clerk account', 'role'], a: 'Users → Add user. AICTE admins can create any role; Institution Admins can add Data Clerks and admins for their own college. Roles: ' + Object.values(ROLES).map((r) => r.label).join(', ') + '.', to: [['Users', '/app/users']] },
  { k: ['roles', 'who can', 'permission', 'access control'], a: Object.values(ROLES).map((r) => `${r.label}: ${r.desc}`).join('\n') },
  { k: ['api', 'erp', 'integration', 'integrate', 'openapi', 'endpoint'], a: 'College ERPs can call the same pipeline through the REST API (POST /api/v1/enrolments, GET /api/v1/programmes/{id}/ledger, POST /api/v1/verify…). The API sandbox lets you try every endpoint with your role and download the OpenAPI spec.', to: [['API sandbox', '/app/api']] },
  { k: ['dropout', 'attrition', 'withdraw', 'early warning', 'lifecycle'], a: 'Lifecycle shows a dropout risk per programme from this term’s withdrawals, the 3-year average and the trend. Institution Admins record withdrawals, transfers and graduation from the student page; the seat is vacated in the ledger automatically.', to: [['Lifecycle', '/app/lifecycle']] },
  { k: ['print certificate', 'certificate', 'degree', 'bonafide'], a: 'Institution Admin → Certificates. Choose a student; the certificate prints APAAR ID, your student ID and an AICTE-signed QR that anyone can verify.', to: [['Certificates', '/app/certificates']] },
  { k: ['digilocker', 'push'], a: 'Credentials can be pushed to the student’s DigiLocker "Issued documents" (simulated here; production uses the DigiLocker Issuer API). The student sees the push status in My credentials.' },
  { k: ['transparency', 'public', 'parents'], a: 'The public Transparency page shows each college’s approved intake, seat fill, category mix and trust band. No personal data; small counts (<5) are suppressed.', to: [['Transparency', '/transparency']] },
  { k: ['inspection', 'inspect', 'visit'], roles: ['aicte_admin', 'regional_officer'], a: 'Inspection planner ranks colleges by Trust Score (lowest first) with reasons. Tick colleges and schedule an inspection with a date and officer.', to: [['Inspection planner', '/app/inspection']] },
  { k: ['password', 'change password', 'profile'], a: 'Open Profile (bottom of the menu) to change your password.', to: [['Profile', '/app/profile']] },
  { k: ['language', 'hindi', 'marathi'], a: 'Use the language selector in the top bar (English, हिन्दी, मराठी).' },
  { k: ['reset', 'demo data', 'start again'], a: 'In demo mode, the sign-in page has "Reset demo data", which rebuilds the full synthetic dataset.' },
  { k: ['firebase', 'database', 'deploy', 'hosting'], a: 'Out of the box the app runs in demo mode (data in your browser). Add your Firebase keys to .env and it switches to Firebase Auth + Firestore on the free Spark plan; the README has the steps.' },
  { k: ['rules', 'cap', 'threshold', 'settings'], roles: ['aicte_admin'], a: 'Rules & settings holds the category caps and the Radar thresholds (shared contact limit, YoY jump %, name match %, outlier score). Every change is audited.', to: [['Rules & settings', '/app/rules']] },
  { k: ['inbox', 'whatsapp', 'sms', 'notification', 'message'], a: 'Inbox shows the WhatsApp / SMS / in-app messages the platform sent you (upload results, flags, consent requests).', to: [['Inbox', '/app/inbox']] },
  { k: ['state machine', 'record state', 'pipeline', 'status of record'], a: 'Records move: Pre-validated → APAAR-verified → Ledger-accepted (college signed and submitted) → AICTE-verified. A record held for a duplicate check is "On hold" until resolved.' },
];

const STATE_ALIASES = { mh: 'Maharashtra', gj: 'Gujarat', ka: 'Karnataka', tn: 'Tamil Nadu', ts: 'Telangana', up: 'Uttar Pradesh', mp: 'Madhya Pradesh', wb: 'West Bengal', bengal: 'West Bengal' };
const PROG = [[/b\.?tech cs|\bcse\b|\bbtcs\b|computer/, 'BTCS'], [/\bece\b|\bbtec\b|electronics/, 'BTEC'], [/mech|\bbtme\b/, 'BTME'], [/\bmba\b/, 'MBA'], [/\bmca\b/, 'MCA'], [/pgdm/, 'PGDM'], [/diploma|civil|\bdce\b/, 'DCE']];
const CAT = [[/foreign|\bfn\b/, ['FN']], [/\boci\b|pio/, ['OCI']], [/\bnri\b/, ['NRI']], [/tfw|fee waiver/, ['TFW']], [/pmsss/, ['PMSSS']], [/lateral/, ['LAT']], [/supernumerary/, ['TFW', 'FN', 'OCI', 'CIWGC', 'PMSSS', 'LAT']], [/regular/, ['REG']], [/gulf|ciwgc/, ['CIWGC']]];

function parseFilters(q, user) {
  const f = {};
  const states = ALL_STATES.filter((s) => q.includes(s.toLowerCase()));
  Object.entries(STATE_ALIASES).forEach(([a, s]) => new RegExp(`\\b${a}\\b`).test(q) && states.push(s));
  if (states.length) f.states = [...new Set(states)];
  const insts = visibleInstitutions(user).filter((i) => q.includes(i.short.toLowerCase()) || q.includes(i.name.toLowerCase()) || q.includes(i.name.split(' ')[0].toLowerCase()));
  if (insts.length && insts.length < visibleInstitutions(user).length) f.insts = insts.map((i) => i.id);
  for (const [re, code] of PROG) if (re.test(q)) { f.prog = code; break; }
  for (const [re, cats] of CAT) if (re.test(q)) { f.cats = cats; break; }
  if (/\b(girls?|female|women)\b/.test(q)) f.gender = 'F';
  else if (/\b(boys?|male|men)\b/.test(q)) f.gender = 'M';
  if (/withdr|dropp|have left|who left|dropout/.test(q) && !/seats? left/.test(q)) f.status = 'dropped';
  else if (/graduat|passed out|completed/.test(q)) f.status = 'graduated';
  else if (/on hold|held/.test(q)) f.hold = true;
  if (/not verified|unverified|pending verification/.test(q)) f.unverified = true;
  else if (/aicte.verified|verified by aicte/.test(q)) f.verified = true;
  return f;
}

const describe = (f) => [
  f.cats && f.cats.map((c) => CATEGORIES[c].label).join('/'),
  f.gender && (f.gender === 'F' ? 'female' : 'male'),
  f.status && (f.status === 'dropped' ? 'withdrawn' : f.status),
  f.hold && 'on-hold', f.verified && 'AICTE-verified', f.unverified && 'not yet AICTE-verified',
  f.prog && db.find('programmes', (p) => p.code === f.prog)?.course,
  f.insts && 'at ' + f.insts.map((i) => db.get('institutions', i)?.short).join(', '),
  f.states && 'in ' + f.states.join(', '),
].filter(Boolean).join(', ');

function applyFilters(list, f, rules) {
  return list.filter((e) => {
    if (f.status) { if (e.status !== f.status) return false; } else if (e.status !== 'active' || e.academicYear !== rules.academicYear) return false;
    if (f.states && !f.states.includes(e.state)) return false;
    if (f.insts && !f.insts.includes(e.institutionId)) return false;
    if (f.prog && e.programmeCode !== f.prog) return false;
    if (f.cats && !f.cats.includes(e.category)) return false;
    if (f.gender && e.gender !== f.gender) return false;
    if (f.hold && e.recordState !== 'on_hold') return false;
    if (f.verified && e.recordState !== 'aicte_verified') return false;
    if (f.unverified && e.recordState === 'aicte_verified') return false;
    return true;
  });
}

const hasData = (u) => u && ['aicte_admin', 'regional_officer', 'institution_admin', 'data_clerk'].includes(u.role);

function dataAnswer(q, user) {
  const rules = db.rules();
  const f = parseFilters(q, user);
  const insts = visibleInstitutions(user).filter((i) => (!f.states || f.states.includes(i.state)) && (!f.insts || f.insts.includes(i.id)));
  const scope = describe(f);

  // V-code explanations
  const code = q.match(/\bv\s?(\d{2})\b/);
  if (code && VCODES['V' + code[1]]) {
    const v = VCODES['V' + code[1]];
    return { text: `V${code[1]} — ${v.title}.\nSeverity: ${v.severity === 'block' ? 'Block (row is rejected and must be fixed)' : v.severity === 'hold' ? 'Hold (record is frozen until AICTE resolves it)' : 'Flag (raised for review)'}; checked in layer ${v.layer} of validation.`, to: [['Help: validation codes', '/help#codes']] };
  }

  if (/flag|anomal|suspicious|ghost|fraud|duplicate/.test(q)) {
    let flags = visibleFlags(user).filter((x) => ['open', 'review'].includes(x.status) && insts.some((i) => (x.refs?.institutionIds || [x.institutionId]).includes(i.id)));
    if (/duplicate/.test(q)) flags = flags.filter((x) => ['V04', 'V11'].includes(x.code));
    const by = countBy(flags, (x) => x.code);
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, VCODES[c].title, n]);
    return { text: flags.length ? `${flags.length} open flag(s)${scope ? ' ' + scope : ''}:` : `No open flags${scope ? ' ' + scope : ''}. 👍`, table: rows.length ? { head: ['Code', 'Meaning', 'Open'], rows } : null, to: [['Open Flags', '/app/flags'], ['Radar', '/app/radar']] };
  }
  if (/scholarship|claim|nsp/.test(q)) {
    const claims = db.where('scholarships', (c) => insts.some((i) => i.id === c.institutionId)).map((c) => ({ c, s: claimStatus(c, rules) }));
    const bad = claims.filter((x) => x.s.status !== 'ok');
    const amt = bad.reduce((s, x) => s + x.c.amount, 0);
    return { text: `${claims.length} scholarship claim(s)${scope ? ' ' + scope : ''}; ${bad.length} fail the seat check, worth ₹${amt.toLocaleString('en-IN')} at risk.`, table: bad.length ? { head: ['Problem', 'Claims'], rows: Object.entries(countBy(bad, (x) => x.s.label)) } : null, to: [['Scholarships', '/app/scholarships']] };
  }
  if (/trust|risk|inspect|worst|weakest|lowest score/.test(q) && !/dropout/.test(q)) {
    const ranked = insts.map((i) => ({ i, t: computeTrust(i, rules) })).sort((a, b) => a.t.score - b.t.score).slice(0, 5);
    return { text: `Lowest Trust Scores${scope ? ' ' + scope : ''}:`, table: { head: ['Institution', 'Score', 'Band'], rows: ranked.map(({ i, t }) => [i.short, t.score, t.band.label]) }, to: [['Inspection planner', '/app/inspection']] };
  }
  if (/over intake|excess|exceed|beyond|blocked|over-admission|overadmission/.test(q)) {
    const ids = new Set(insts.map((i) => i.id));
    const blocked = db.where('ledger', (l) => l.action === 'BLOCKED' && ids.has(l.institutionId));
    const by = countBy(blocked, (l) => db.get('institutions', l.institutionId)?.short);
    return { text: blocked.length ? `The Seat Ledger blocked ${blocked.length} admission attempt(s) beyond approved seats${scope ? ' ' + scope : ''}. No college can exceed intake in the ledger.` : `No blocked over-intake attempts${scope ? ' ' + scope : ''}.`, table: blocked.length ? { head: ['Institution', 'Blocked attempts'], rows: Object.entries(by) } : null, to: [['Seat Ledger', '/app/ledger']] };
  }
  if (/vacan|seats left|free seat|empty seat|available seat|fill/.test(q)) {
    const progs = db.where('programmes', (p) => insts.some((i) => i.id === p.institutionId) && p.academicYear === rules.academicYear && (!f.prog || p.code === f.prog));
    const rows = progs.map((p) => {
      const o = occupancy(p, rules);
      return [`${db.get('institutions', p.institutionId)?.short} · ${p.code}`, `${o.used.W}/${o.cap.W}`, o.cap.W - o.used.W];
    }).sort((a, b) => b[2] - a[2]).slice(0, 8);
    const left = progs.reduce((s, p) => { const o = occupancy(p, rules); return s + (o.cap.W - o.used.W); }, 0);
    return { text: `${left} regular seat(s) free${scope ? ' ' + scope : ''} across ${progs.length} programme(s). Most free:`, table: { head: ['Programme', 'Used', 'Free'], rows }, to: [['Seat Ledger', '/app/ledger']] };
  }
  if (/dropout|attrition|early warning/.test(q)) {
    const progs = db.where('programmes', (p) => insts.some((i) => i.id === p.institutionId) && p.academicYear === rules.academicYear);
    const risks = progs.map((p) => cohortRisk(p, rules)).sort((a, b) => b.risk - a.risk).slice(0, 5);
    return { text: `Highest dropout risk${scope ? ' ' + scope : ''}:`, table: { head: ['Programme', 'Risk', 'Level'], rows: risks.map((r) => [`${db.get('institutions', r.prog.institutionId)?.short} · ${r.prog.code}`, r.risk, r.level]) }, to: [['Lifecycle', '/app/lifecycle']] };
  }
  if (/by state|state.?wise|each state|which state/.test(q)) {
    const list = applyFilters(visibleEnrolments(user), f, rules);
    const by = countBy(list, (e) => e.state);
    return { text: `Students${scope ? ' (' + scope + ')' : ''} by state:`, table: { head: ['State', 'Students'], rows: Object.entries(by).sort((a, b) => b[1] - a[1]) } };
  }
  if (/by (institution|college)|each (institution|college)|which (institution|college)|top (institution|college)/.test(q)) {
    const list = applyFilters(visibleEnrolments(user), f, rules);
    const by = countBy(list, (e) => db.get('institutions', e.institutionId)?.short);
    return { text: `Students${scope ? ' (' + scope + ')' : ''} by institution:`, table: { head: ['Institution', 'Students'], rows: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10) } };
  }
  if (/by category|category.?wise|category mix/.test(q)) {
    const list = applyFilters(visibleEnrolments(user), { ...f, cats: undefined }, rules);
    return { text: `Category mix${scope ? ' ' + scope : ''}:`, table: { head: ['Category', 'Students'], rows: Object.entries(countBy(list, (e) => CATEGORIES[e.category].label)).sort((a, b) => b[1] - a[1]) } };
  }
  if (/how many|count|number of|total|students|enrol|admitted|admissions/.test(q)) {
    const list = applyFilters(visibleEnrolments(user), f, rules);
    const intake = insts.reduce((s, i) => s + db.where('programmes', (p) => p.institutionId === i.id && p.academicYear === rules.academicYear && (!f.prog || p.code === f.prog)).reduce((a, p) => a + p.approvedIntake, 0), 0);
    const extra = !f.status && !f.cats && !f.gender && intake ? ` Approved intake for this scope is ${intake}.` : '';
    return { text: `${list.length.toLocaleString('en-IN')} ${f.status ? '' : 'current '}student record(s)${scope ? ' — ' + scope : ''}.${extra}`, to: [['Students', '/app/students']] };
  }
  return null;
}

function studentAnswer(q, user) {
  const mine = db.where('enrolments', (e) => e.apaarId === user.apaarId);
  if (/status|record|my admission|verified|enrol/.test(q)) {
    const e = mine.find((x) => x.status === 'active') || mine[0];
    if (!e) return { text: 'I could not find an admission record linked to your APAAR ID yet. Your college has to upload it first.' };
    return { text: `You are ${e.status === 'active' ? 'enrolled' : e.status} in ${e.course} at ${db.get('institutions', e.institutionId)?.name}, seat ${e.slotLabel}. Record state: ${e.recordState.replace(/_/g, '-')}.`, to: [['My record', '/app/me']] };
  }
  if (/consent|request|pending/.test(q)) {
    const pend = db.where('consents', (c) => c.apaarId === user.apaarId && c.status === 'pending');
    return { text: pend.length ? `You have ${pend.length} pending request(s): ${pend.map((c) => c.requesterOrg).join(', ')}.` : 'No pending consent requests.', to: [['Consent', '/app/consent']] };
  }
  if (/viewed|access|who saw|who has seen/.test(q)) {
    const log = db.where('accessLog', (a) => a.apaarId === user.apaarId);
    return { text: `${log.length} access(es) recorded. Most recent: ${log.sort((a, b) => b.at.localeCompare(a.at))[0]?.org || '—'}.`, to: [['Who viewed my data', '/app/access']] };
  }
  return null;
}

function verifierAnswer(q, user) {
  if (/my request|status|granted|pending/.test(q)) {
    const mine = db.where('consents', (c) => c.requesterId === user.id);
    const by = countBy(mine, (c) => effectiveStatus(c));
    return { text: mine.length ? `Your requests: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ')}.` : 'You have not made any requests yet.', to: [['Access requests', '/app/requests']] };
  }
  return null;
}

function faqAnswer(q, user) {
  let best = null;
  let bestScore = 0;
  FAQ.forEach((f) => {
    let s = 0;
    f.k.forEach((k) => q.includes(k) && (s += k.length > 6 ? 3 : 2));
    if (s && f.roles && user && f.roles.includes(user.role)) s += 1;
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  });
  return best ? { text: best.a, to: best.to } : null;
}

export function suggestions(user) {
  if (!user) return ['How do I verify a certificate?', 'What is the Seat Ledger?', 'What is APAAR ID?', 'Show transparency data'];
  return {
    aicte_admin: ['How many FN students in Maharashtra?', 'Open flags', 'Lowest trust scores', 'Scholarship claims at risk', 'Students by state'],
    regional_officer: ['Open flags in my region', 'Lowest trust scores', 'How many students are on hold?', 'Dropout risk'],
    institution_admin: ['How do I submit a batch?', 'Seats left in BTCS', 'How do I improve my trust score?', 'Open flags', 'How many girls are enrolled?'],
    data_clerk: ['How do I upload Excel?', 'How do I fix rejected rows?', 'What is V02?', 'Seats left'],
    student: ['What is my status?', 'Pending consent requests', 'How do I share only my name?', 'Who viewed my data?'],
    verifier: ['How do I verify a certificate?', 'How do I request access?', 'Status of my requests'],
  }[user.role];
}

export function ask(text, user) {
  const q = ' ' + String(text || '').toLowerCase().replace(/[?!.]/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (!q.trim()) return { text: 'Ask me anything about the website or your data.' };
  if (/^\s*(hi|hello|hey|namaste|namaskar)\b/.test(q)) {
    return { text: `Namaste${user ? ' ' + user.name.split(' ')[0] : ''}! I am Setu Sahayak. I can explain any page of APAAR-Setu and answer questions about the data you are allowed to see${user ? ` (${user.role === 'aicte_admin' ? 'all India' : ROLES[user.role].label})` : ''}. Try one of the suggestions below.` };
  }
  if (user?.role === 'student') {
    const a = studentAnswer(q, user);
    if (a) return a;
  }
  if (user?.role === 'verifier') {
    const a = verifierAnswer(q, user);
    if (a) return a;
  }
  // How-to questions go to the FAQ first.
  const howTo = /\b(how|where|what is|what are|why|can i|explain|meaning|help)\b/.test(q) && !/how many|how much|count|number of/.test(q);
  if (howTo) {
    const code = q.match(/\bv\s?(\d{2})\b/);
    if (!code) {
      const a = faqAnswer(q, user);
      if (a) return a;
    }
  }
  if (hasData(user)) {
    const a = dataAnswer(q, user);
    if (a) return a;
  } else if (/how many|count|number of|students in|flags|trust/.test(q)) {
    return { text: user ? 'Your role does not have access to student-level statistics. Aggregate figures per college are on the public Transparency page.' : 'Sign in to ask about data. Aggregate figures per college are on the public Transparency page.', to: [['Transparency', '/transparency']] };
  }
  const a = faqAnswer(q, user);
  if (a) return a;
  return { text: 'I did not catch that. I can help with pages (upload, ledger, flags, verify, consent, reports…) and with data questions such as "How many OCI students in Karnataka?" or "Lowest trust scores".', to: [['Open Help', '/help']] };
}

export const REGION_NAME = (r) => REGIONS[r]?.name;
export { groupBy };
