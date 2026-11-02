// Shared constants: roles, permissions, regions, categories, validation codes.

export const ROLES = {
  aicte_admin: { label: 'AICTE Admin', short: 'Admin', color: 'red', desc: 'Full national view. Manages users, rules, flags, audit and reports.' },
  regional_officer: { label: 'Regional Officer', short: 'Regional', color: 'orange', desc: 'Monitors institutions in their region, reviews flags, plans inspections.' },
  institution_admin: { label: 'Institution Admin', short: 'Institution', color: 'yellow', desc: 'Runs the college seat ledger, signs and submits batches, issues certificates.' },
  data_clerk: { label: 'Data Clerk', short: 'Clerk', color: 'yellow', desc: 'Uploads and corrects student records for one institution. Cannot submit to AICTE.' },
  verifier: { label: 'Verifier', short: 'Verifier', color: 'green', desc: 'Employer, university or regulator. Verifies credentials and requests consented access.' },
  student: { label: 'Student', short: 'Student', color: 'green', desc: 'Sees own records, holds credentials, controls who can see the data.' },
};

// Permission matrix. Every page and action checks one of these.
export const PERMS = {
  'dash.national': ['aicte_admin'],
  'dash.region': ['regional_officer'],
  'dash.institution': ['institution_admin', 'data_clerk'],
  'institutions.view': ['aicte_admin', 'regional_officer'],
  'ledger.view': ['aicte_admin', 'regional_officer', 'institution_admin', 'data_clerk'],
  'students.view': ['aicte_admin', 'regional_officer', 'institution_admin', 'data_clerk'],
  'students.edit': ['institution_admin', 'data_clerk'],
  'students.lifecycle': ['institution_admin'],
  'upload.create': ['institution_admin', 'data_clerk'],
  'batch.submit': ['institution_admin'],
  'batch.verify': ['aicte_admin', 'regional_officer'],
  'radar.view': ['aicte_admin', 'regional_officer'],
  'radar.run': ['aicte_admin'],
  'flags.view': ['aicte_admin', 'regional_officer', 'institution_admin'],
  'flags.resolve': ['aicte_admin', 'regional_officer'],
  'scholarship.view': ['aicte_admin', 'regional_officer'],
  'lifecycle.view': ['aicte_admin', 'regional_officer', 'institution_admin'],
  'reports.view': ['aicte_admin', 'regional_officer', 'institution_admin'],
  'audit.view': ['aicte_admin'],
  'users.manage': ['aicte_admin', 'institution_admin'],
  'rules.manage': ['aicte_admin'],
  'api.sandbox': ['aicte_admin', 'institution_admin', 'data_clerk', 'verifier'],
  'certificates.issue': ['institution_admin'],
  'trust.view': ['aicte_admin', 'regional_officer', 'institution_admin'],
  'inspection.plan': ['aicte_admin', 'regional_officer'],
  'verify.request': ['verifier'],
  'student.self': ['student'],
  'notifications.view': ['aicte_admin', 'regional_officer', 'institution_admin', 'data_clerk', 'student', 'verifier'],
};

export const can = (user, perm) => !!user && (PERMS[perm] || []).includes(user.role);

// AICTE regional offices (subset used in this demo).
export const REGIONS = {
  WRO: { name: 'Western', states: ['Maharashtra', 'Gujarat'] },
  SWRO: { name: 'South-Western', states: ['Karnataka'] },
  SRO: { name: 'Southern', states: ['Tamil Nadu'] },
  SCRO: { name: 'South-Central', states: ['Telangana'] },
  NRO: { name: 'Northern', states: ['Uttar Pradesh'] },
  CRO: { name: 'Central', states: ['Madhya Pradesh'] },
  ERO: { name: 'Eastern', states: ['West Bengal'] },
};
export const ALL_STATES = Object.values(REGIONS).flatMap((r) => r.states);
export const regionOfState = (s) => Object.keys(REGIONS).find((k) => REGIONS[k].states.includes(s));

// Admission categories. "group" decides which seat pool a category draws from.
export const CATEGORIES = {
  REG: { label: 'Regular', group: 'W', proof: null, desc: 'Within approved intake' },
  NRI: { label: 'NRI', group: 'W', proof: 'NRI proof (passport/visa of sponsor)', desc: 'Within intake, sub-cap applies' },
  TFW: { label: 'Tuition Fee Waiver', group: 'T', proof: 'Family income certificate', desc: 'Supernumerary' },
  FN: { label: 'Foreign National', group: 'F', proof: 'Passport number', desc: 'Supernumerary (FN/OCI/PIO/CIWGC pool)' },
  OCI: { label: 'OCI / PIO', group: 'F', proof: 'OCI card number', desc: 'Supernumerary (FN/OCI/PIO/CIWGC pool)' },
  CIWGC: { label: 'Children of Indian Workers in Gulf', group: 'F', proof: 'Parent employment certificate', desc: 'Supernumerary (FN/OCI/PIO/CIWGC pool)' },
  PMSSS: { label: "PM's Special Scholarship (J&K/Ladakh)", group: 'P', proof: 'PMSSS allotment ID', desc: 'Supernumerary' },
  LAT: { label: 'Lateral Entry', group: 'L', proof: 'Diploma certificate number', desc: 'Supernumerary, 2nd year entry' },
};

export const GROUPS = {
  W: { label: 'Within intake', prefix: 'W' },
  T: { label: 'TFW (supernumerary)', prefix: 'T' },
  F: { label: 'FN / OCI / PIO / CIWGC (supernumerary)', prefix: 'F' },
  P: { label: 'PMSSS (supernumerary)', prefix: 'P' },
  L: { label: 'Lateral entry (supernumerary)', prefix: 'L' },
};

// Default rules. Editable by the AICTE admin in Rules & Settings.
// Values are configurable starting points, to be confirmed against the current Approval Process Handbook.
export const DEFAULT_RULES = {
  nriSubCapPct: 15,
  tfwPct: 5,
  fnPoolPct: 15,
  pmsssAbs: 2,
  lateralPct: 10,
  lateralLevels: ['UG', 'Diploma'],
  sharedContactMax: 3,
  yoyJumpPct: 30,
  nameMatchMin: 0.85,
  fuzzyDupMin: 0.9,
  outlierScoreMin: 0.62,
  declaredGapPct: 10,
  smallCellSuppress: 5,
  academicYear: 2026,
};

export const VCODES = {
  V01: { title: 'APAAR ID missing or malformed', severity: 'block', layer: 1 },
  V02: { title: 'APAAR not found in ABC or name/DOB mismatch', severity: 'block', layer: 2 },
  V03: { title: 'No free seat slot in this category', severity: 'block', layer: 2 },
  V04: { title: 'APAAR already active at another institution', severity: 'hold', layer: 2 },
  V05: { title: 'Category needs a proof document', severity: 'block', layer: 1 },
  V06: { title: 'Same phone or bank account on too many students', severity: 'flag', layer: 3 },
  V07: { title: 'Institution enrolment jumped sharply year on year', severity: 'flag', layer: 3 },
  V08: { title: 'Mandatory field missing or invalid', severity: 'block', layer: 1 },
  V09: { title: 'Category and nationality do not match', severity: 'block', layer: 1 },
  V10: { title: 'Duplicate row or already enrolled here', severity: 'block', layer: 1 },
  V11: { title: 'Possible duplicate identity (fuzzy match)', severity: 'flag', layer: 3 },
  V12: { title: 'Scholarship claimed without a valid seat', severity: 'flag', layer: 3 },
  V13: { title: 'Declared enrolment differs from verified records', severity: 'flag', layer: 3 },
  V14: { title: 'Institution is a statistical outlier', severity: 'flag', layer: 3 },
  V15: { title: 'Lateral entry not allowed for this programme', severity: 'block', layer: 1 },
};

export const RECORD_STATES = {
  draft: { label: 'Draft', color: 'grey' },
  pre_validated: { label: 'Pre-validated', color: 'yellow' },
  apaar_verified: { label: 'APAAR-verified', color: 'orange' },
  ledger_accepted: { label: 'Ledger-accepted', color: 'green' },
  aicte_verified: { label: 'AICTE-verified', color: 'green' },
  on_hold: { label: 'On hold', color: 'red' },
};

export const STATUS = {
  active: 'Active',
  dropped: 'Withdrawn',
  graduated: 'Graduated',
  transferred: 'Transferred',
};

export const COURSES = [
  { level: 'UG', course: 'B.Tech Computer Science', code: 'BTCS', years: 4 },
  { level: 'UG', course: 'B.Tech Electronics & Communication', code: 'BTEC', years: 4 },
  { level: 'UG', course: 'B.Tech Mechanical', code: 'BTME', years: 4 },
  { level: 'PG', course: 'MBA', code: 'MBA', years: 2 },
  { level: 'PG', course: 'MCA', code: 'MCA', years: 2 },
  { level: 'PGDM', course: 'PGDM', code: 'PGDM', years: 2 },
  { level: 'Diploma', course: 'Diploma Civil Engineering', code: 'DCE', years: 3 },
];

export const CONSENT_FIELDS = {
  name: 'Name',
  programme: 'Programme',
  institution: 'Institution',
  admissionYear: 'Admission year',
  status: 'Current status',
  dob: 'Date of birth',
  category: 'Admission category',
};

export const DEMO_PASSWORD = 'Demo@1234';
