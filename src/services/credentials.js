// Verifiable Enrolment / Completion Credentials with selective disclosure.
// Each claim is salted and hashed; AICTE signs the list of digests (Ed25519).
// A presentation reveals only the chosen claims + their salts, so a verifier can check them
// against the signed digests offline, without seeing the hidden claims.
import { db } from '../data/store';
import { AICTE_KEYS, AICTE_PUBLIC, AICTE_DID, canon, signText, verifyText, b64url, fromB64url, shortDigest, randomSalt, randomId } from '../lib/crypto';
import { audit } from './audit';
import { notify } from './notify';

export const CLAIM_LABELS = {
  name: 'Name',
  apaarId: 'APAAR ID',
  studentId: 'Institution student ID',
  institution: 'Institution',
  aicteId: 'AICTE institution ID',
  programme: 'Programme',
  admissionYear: 'Admission year',
  status: 'Status',
  dob: 'Date of birth',
  category: 'Admission category',
  completedOn: 'Completed on',
};

export function claimsFor(e, type) {
  const inst = db.get('institutions', e.institutionId);
  const c = {
    name: e.name,
    apaarId: e.apaarId,
    studentId: e.instStudentId,
    institution: inst?.name || '',
    aicteId: inst?.aicteId || '',
    programme: e.course,
    admissionYear: String(e.academicYear),
    status: e.status === 'graduated' ? 'Graduated' : e.status === 'active' ? 'Enrolled' : e.status,
    dob: e.dob,
    category: e.category,
  };
  if (type === 'Completion') c.completedOn = e.exitDate || new Date().toISOString().slice(0, 10);
  return c;
}

const digestOf = (k, salt, v) => shortDigest(`${salt}|${k}|${v}`);

export function issueCredential(e, type, actor) {
  const claims = claimsFor(e, type);
  const disclosures = {};
  const digests = [];
  Object.entries(claims).forEach(([k, v]) => {
    const salt = randomSalt();
    disclosures[k] = [salt, v];
    digests.push(digestOf(k, salt, v));
  });
  digests.sort();
  const id = randomId('VC');
  const core = { v: 1, id, t: type === 'Completion' ? 'C' : 'E', iss: AICTE_DID, iat: new Date().toISOString().slice(0, 10), dg: digests };
  const sig = signText(canon(core), AICTE_KEYS.secretKey);
  const cred = {
    id,
    apaarId: e.apaarId,
    enrolmentId: e.id,
    institutionId: e.institutionId,
    type,
    core,
    sig,
    disclosures,
    issuedAt: new Date().toISOString(),
    issuedBy: actor?.name || 'AICTE',
    revoked: false,
    digilocker: 'not_pushed',
  };
  db.put('credentials', cred);
  audit(actor, 'CREDENTIAL_ISSUE', 'credential:' + id, { detail: `${type} credential for ${e.apaarId}` });
  notify('apaar:' + e.apaarId, `Your ${type.toLowerCase()} credential has been issued by AICTE. You can share it as a QR code from APAAR-Setu.`, { channel: 'sms', title: 'Credential issued' });
  return cred;
}

// W3C Verifiable Credentials data model view (for download / DigiLocker push).
export function toW3C(cred) {
  return {
    '@context': ['https://www.w3.org/2018/credentials/v1', 'https://aicte-india.org/apaar-setu/contexts/v1'],
    id: 'urn:uuid:' + cred.id,
    type: ['VerifiableCredential', cred.type === 'Completion' ? 'APAARCompletionCredential' : 'APAAREnrolmentCredential'],
    issuer: AICTE_DID,
    issuanceDate: cred.core.iat,
    credentialSubject: { id: 'did:apaar:' + cred.apaarId, ...Object.fromEntries(Object.entries(cred.disclosures).map(([k, [, v]]) => [k, v])) },
    proof: {
      type: 'Ed25519Signature2020 (salted-digest selective disclosure)',
      verificationMethod: AICTE_DID + '#key-1',
      publicKeyBase64url: AICTE_PUBLIC,
      signedDigests: cred.core.dg,
      proofValue: cred.sig,
    },
  };
}

// Builds a compact presentation string carrying only chosen claims.
export function presentation(cred, fields) {
  const d = {};
  fields.forEach((f) => cred.disclosures[f] && (d[f] = cred.disclosures[f]));
  const json = JSON.stringify({ c: cred.core, s: cred.sig, d });
  return 'APS1.' + b64url(new TextEncoder().encode(json));
}
export const presentationUrl = (p) => `${window.location.origin}/verify#${p}`;

// Offline verification. Needs only the embedded AICTE public key.
export function verifyPresentation(input) {
  try {
    let text = String(input || '').trim();
    const hashAt = text.indexOf('APS1.');
    if (hashAt < 0) return { valid: false, error: 'This is not an APAAR-Setu credential code.' };
    text = text.slice(hashAt + 5).split(/[\s&]/)[0];
    const obj = JSON.parse(new TextDecoder().decode(fromB64url(text)));
    const { c: core, s: sig, d } = obj;
    const sigOk = verifyText(canon(core), sig, AICTE_KEYS.publicKey);
    const claims = {};
    const bad = [];
    Object.entries(d || {}).forEach(([k, [salt, v]]) => {
      if (core.dg.includes(digestOf(k, salt, v))) claims[k] = v;
      else bad.push(k);
    });
    const revoked = (db.get('settings', 'revocations')?.ids || []).includes(core.id);
    return {
      valid: sigOk && !bad.length && !revoked,
      sigOk,
      revoked,
      tampered: bad,
      claims,
      hiddenCount: core.dg.length - Object.keys(claims).length,
      type: core.t === 'C' ? 'Completion credential' : 'Enrolment credential',
      issuedOn: core.iat,
      issuer: core.iss,
      id: core.id,
    };
  } catch {
    return { valid: false, error: 'The code is damaged or incomplete. Scan again or paste the full link.' };
  }
}

export function revokeCredential(cred, reason, actor) {
  db.put('credentials', { ...cred, revoked: true, revokedReason: reason, revokedAt: new Date().toISOString() });
  const r = db.get('settings', 'revocations') || { id: 'revocations', ids: [] };
  db.put('settings', { ...r, ids: [...new Set([...(r.ids || []), cred.id])] });
  audit(actor, 'CREDENTIAL_REVOKE', 'credential:' + cred.id, { detail: reason });
}

export function pushToDigiLocker(cred, actor) {
  // Simulated NAD/DigiLocker push. In production: DigiLocker Issuer API (issued documents).
  db.put('credentials', { ...cred, digilocker: 'pushed', digilockerAt: new Date().toISOString(), digilockerUri: `in.gov.digilocker.aicte-APAARSETU-${cred.id}` });
  audit(actor, 'DIGILOCKER_PUSH', 'credential:' + cred.id, { detail: 'Pushed to DigiLocker issued documents (simulated)' });
}
