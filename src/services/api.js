// REST API layer. In the sandbox, requests are routed in the browser to the same services the UI uses,
// with the caller's role enforced exactly as the server would. Production: the same handlers behind
// Cloud Functions / an API gateway with OAuth 2.0 client credentials.
import { db } from '../data/store';
import { can, CONSENT_FIELDS } from '../lib/constants';
import { mockAbc } from '../data/mockAbc';
import { canSeeInstitution, visibleEnrolments, visibleFlags } from '../data/scope';
import { processUpload, submitBatch } from './enrolment';
import { occupancy, capacity } from './ledger';
import { verifyPresentation, presentation } from './credentials';
import { requestConsent, openSharedRecord, effectiveStatus } from './consent';
import { changeStatus } from './lifecycle';
import { buildReport, REPORTS } from './reports';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const need = (cond, status, msg) => {
  if (!cond) throw new ApiError(status, msg);
};
const pubEnrolment = (e) => ({ id: e.id, apaarId: e.apaarId, name: e.name, institutionId: e.institutionId, programme: e.programmeCode, category: e.category, slot: e.slotLabel, status: e.status, recordState: e.recordState, admissionDate: e.admissionDate });

export const ENDPOINTS = [
  { m: 'GET', p: '/api/v1/registry/{apaarId}', d: 'Mock ABC: look up an APAAR ID (same contract as the ABC institutional API).', roles: 'any', sample: () => ({ path: { apaarId: db.all('enrolments')[0]?.apaarId || '' } }) },
  { m: 'POST', p: '/api/v1/registry/verify', d: 'Mock ABC: verify APAAR + name + date of birth.', roles: 'any', sample: () => { const e = db.all('enrolments')[0]; return { body: { apaarId: e?.apaarId, name: e?.name, dob: e?.dob } }; } },
  { m: 'GET', p: '/api/v1/programmes/{programmeId}/ledger', d: 'Seat Ledger capacity and occupancy for a programme.', roles: 'ledger.view', sample: (u) => ({ path: { programmeId: db.find('programmes', (p) => canSeeInstitution(u, p.institutionId))?.id || '' } }) },
  { m: 'POST', p: '/api/v1/enrolments', d: 'Upload one or more students (same pipeline as Excel). Returns accepted, held and rejected rows with codes.', roles: 'upload.create', sample: (u) => ({ body: { rows: [{ apaar_id: '', student_name: '', dob: 'YYYY-MM-DD', gender: 'F', guardian_name: '', phone: '9876543210', nationality: 'Indian', programme_code: db.find('programmes', (p) => p.institutionId === u.institutionId)?.code, category: 'REG', admission_date: new Date().toISOString().slice(0, 10), admission_mode: 'Counselling', institution_student_id: 'API0001' }] } }) },
  { m: 'GET', p: '/api/v1/enrolments/{apaarId}', d: 'Records for an APAAR ID within your scope.', roles: 'students.view', sample: (u) => ({ path: { apaarId: visibleEnrolments(u)[0]?.apaarId || '' } }) },
  { m: 'PATCH', p: '/api/v1/enrolments/{id}/status', d: 'Withdraw / transfer / graduate a student; vacates the seat.', roles: 'students.lifecycle', sample: (u) => ({ path: { id: visibleEnrolments(u).find((e) => e.status === 'active')?.id || '' }, body: { status: 'dropped', reason: 'Joined another institution' } }) },
  { m: 'POST', p: '/api/v1/batches/{batchId}/submit', d: 'Sign and submit a draft batch to AICTE.', roles: 'batch.submit', sample: (u) => ({ path: { batchId: db.find('batches', (b) => b.institutionId === u.institutionId && b.status === 'draft')?.id || '' } }) },
  { m: 'GET', p: '/api/v1/flags', d: 'Open flags in your scope.', roles: 'flags.view', sample: () => ({}) },
  { m: 'GET', p: '/api/v1/reports/{type}', d: 'Report rows (compliance, state, category, flags, nba, naac, nirf).', roles: 'reports.view', sample: () => ({ path: { type: 'naac' } }) },
  { m: 'GET', p: '/api/v1/credentials/{apaarId}/qr', d: 'Presentation code for a certificate QR (institution of the student).', roles: 'certificates.issue', sample: (u) => ({ path: { apaarId: db.find('credentials', (c) => c.institutionId === u.institutionId)?.apaarId || '' } }) },
  { m: 'POST', p: '/api/v1/verify', d: 'Verify a credential presentation (QR content).', roles: 'any', sample: () => { const c = db.all('credentials')[0]; return { body: { presentation: c ? presentation(c, ['name', 'programme', 'status']) : 'APS1.…' } }; } },
  { m: 'POST', p: '/api/v1/consents', d: 'Verifier: request consented access to a student record.', roles: 'verify.request', sample: () => ({ body: { apaarId: '', purpose: 'Pre-employment verification for offer letter', fields: ['name', 'programme', 'status'], days: 15 } }) },
  { m: 'GET', p: '/api/v1/consents/{id}/data', d: 'Verifier: read the shared data once consent is granted (access is logged).', roles: 'verify.request', sample: (u) => ({ path: { id: db.find('consents', (c) => c.requesterId === u.id && c.status === 'granted')?.id || '' } }) },
];

function match(ep, method, path) {
  if (ep.m !== method) return null;
  const re = new RegExp('^' + ep.p.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)') + '$');
  const m = path.match(re);
  return m ? m.groups || {} : null;
}

export function call(user, method, path, body) {
  const t0 = performance.now();
  try {
    need(user, 401, 'Missing or invalid API key');
    const ep = ENDPOINTS.find((e) => match(e, method, path));
    need(ep, 404, `No route for ${method} ${path}`);
    if (ep.roles !== 'any') need(can(user, ep.roles), 403, `Your role (${user.role}) is not allowed to call this endpoint`);
    const p = match(ep, method, path);
    const data = handle(ep.p, p, body || {}, user);
    return { status: method === 'POST' && ep.p === '/api/v1/enrolments' ? 201 : 200, data, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { status: e.status || 500, data: { error: e.message }, ms: Math.round(performance.now() - t0) };
  }
}

function handle(route, p, body, user) {
  switch (route) {
    case '/api/v1/registry/{apaarId}':
      return mockAbc.lookup(p.apaarId);
    case '/api/v1/registry/verify':
      need(body.apaarId, 422, 'apaarId is required');
      return mockAbc.verify(body);
    case '/api/v1/programmes/{programmeId}/ledger': {
      const prog = db.get('programmes', p.programmeId);
      need(prog && canSeeInstitution(user, prog.institutionId), 404, 'Programme not found in your scope');
      const o = occupancy(prog);
      return { programmeId: prog.id, course: prog.course, approvedIntake: prog.approvedIntake, capacity: capacity(prog), used: o.used, free: { W: o.cap.W - o.used.W, T: o.cap.T - o.used.T, F: o.cap.F - o.used.F, P: o.cap.P - o.used.P, L: o.cap.L - o.used.L } };
    }
    case '/api/v1/enrolments': {
      need(Array.isArray(body.rows) && body.rows.length, 422, 'rows[] is required');
      need(body.rows.length <= 2000, 413, 'Max 2000 rows per call');
      const inst = db.get('institutions', user.institutionId);
      need(inst, 403, 'API key is not linked to an institution');
      const r = processUpload(body.rows.map((x, i) => ({ ...x, __row: i + 1 })), { institution: inst, actor: user, source: 'api', fileName: 'REST API' });
      return { batchId: r.batch.id, accepted: r.accepted.map((e) => ({ apaarId: e.apaarId, slot: e.slotLabel })), held: r.held.map((e) => ({ apaarId: e.apaarId, reason: e.holdReason })), rejected: r.rejected.map((x) => ({ row: x.rowNo, code: x.issues[0].code, message: x.issues[0].msg })) };
    }
    case '/api/v1/enrolments/{apaarId}': {
      const list = visibleEnrolments(user).filter((e) => e.apaarId === p.apaarId);
      need(list.length, 404, 'No records for this APAAR ID in your scope');
      return list.map(pubEnrolment);
    }
    case '/api/v1/enrolments/{id}/status': {
      const e = db.get('enrolments', p.id);
      need(e && canSeeInstitution(user, e.institutionId), 404, 'Record not found in your scope');
      need(['dropped', 'transferred', 'graduated'].includes(body.status), 422, 'status must be dropped, transferred or graduated');
      need(e.status === 'active', 409, 'Record is not active');
      return pubEnrolment(changeStatus(e, body.status, { reason: body.reason || '', actor: user }));
    }
    case '/api/v1/batches/{batchId}/submit': {
      const b = db.get('batches', p.batchId);
      need(b && b.institutionId === user.institutionId, 404, 'Batch not found');
      need(b.status === 'draft', 409, 'Batch is not a draft');
      return { submitted: submitBatch(b.id, user), batchId: b.id };
    }
    case '/api/v1/flags':
      return visibleFlags(user).filter((f) => ['open', 'review'].includes(f.status)).map((f) => ({ id: f.id, code: f.code, severity: f.severity, institutionId: f.institutionId, reason: f.reason, status: f.status }));
    case '/api/v1/reports/{type}': {
      need(REPORTS[p.type], 404, 'Unknown report type');
      need(REPORTS[p.type].for.includes(user.role), 403, 'Report not available for your role');
      return buildReport(p.type, db.all('institutions').filter((i) => canSeeInstitution(user, i.id))).sheets[0].rows;
    }
    case '/api/v1/credentials/{apaarId}/qr': {
      const c = db.where('credentials', (x) => x.apaarId === p.apaarId && x.institutionId === user.institutionId && !x.revoked).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
      need(c, 404, 'No credential for this APAAR ID at your institution');
      const pres = presentation(c, ['name', 'apaarId', 'studentId', 'institution', 'programme', 'status', 'completedOn'].filter((f) => c.disclosures[f]));
      return { credentialId: c.id, type: c.type, presentation: pres, verifyUrl: `${window.location.origin}/verify#${pres}` };
    }
    case '/api/v1/verify':
      need(body.presentation, 422, 'presentation is required');
      return verifyPresentation(body.presentation);
    case '/api/v1/consents': {
      const fields = (body.fields || []).filter((f) => CONSENT_FIELDS[f]);
      try {
        const c = requestConsent({ apaarId: body.apaarId, purpose: body.purpose, fields, days: body.days }, user);
        return { id: c.id, status: c.status, note: 'If the APAAR ID is registered, the student has been notified.' };
      } catch (e) {
        throw new ApiError(422, e.message);
      }
    }
    case '/api/v1/consents/{id}/data': {
      const c = db.get('consents', p.id);
      need(c && c.requesterId === user.id, 404, 'Consent not found');
      need(effectiveStatus(c) === 'granted', 403, `Consent is ${effectiveStatus(c)}`);
      return { apaarId: c.apaarId, fields: c.grantedFields, data: openSharedRecord(c, user), expiresAt: c.expiresAt };
    }
    default:
      throw new ApiError(404, 'Not implemented');
  }
}

export function openApiSpec() {
  const paths = {};
  ENDPOINTS.forEach((e) => {
    paths[e.p] = paths[e.p] || {};
    paths[e.p][e.m.toLowerCase()] = {
      summary: e.d,
      security: e.roles === 'any' ? [] : [{ oauth2: [e.roles] }],
      parameters: (e.p.match(/\{(\w+)\}/g) || []).map((x) => ({ name: x.slice(1, -1), in: 'path', required: true, schema: { type: 'string' } })),
      ...(['POST', 'PATCH'].includes(e.m) ? { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } } : {}),
      responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorised' }, 403: { description: 'Role not allowed' }, 404: { description: 'Not found in scope' }, 422: { description: 'Validation error' } },
    };
  });
  return {
    openapi: '3.0.3',
    info: { title: 'APAAR-Setu API', version: '1.0.0', description: 'Student data upload, Seat Ledger, verification and consent APIs for AICTE-approved institutions. Webhooks: batch.submitted, batch.verified, flag.raised, consent.decided.' },
    servers: [{ url: window.location.origin }],
    components: { securitySchemes: { oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: '/oauth/token', scopes: Object.fromEntries([...new Set(ENDPOINTS.map((e) => e.roles))].filter((r) => r !== 'any').map((r) => [r, r])) } } } } },
    paths,
  };
}
