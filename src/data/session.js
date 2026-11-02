// Boot, sign-in and data loading for both modes.
import { useSyncExternalStore } from 'react';
import { setBackend, replaceAll, db, snapshot, getBackend, getMode, COLS } from './store';
import { localBackend } from './backends/local';
import { firebaseBackend, firebaseConfigured } from './backends/firebase';
import { buildSeed, DEMO_USERS } from './seed';
import { runRadar } from '../services/radar';
import { computePublicStats } from '../services/publicStats';
import { issueCredential } from '../services/credentials';
import { audit } from '../services/audit';
import { sha } from '../lib/crypto';
import { DEMO_PASSWORD } from '../lib/constants';

const SESSION_KEY = 'apaar-setu-session';
const S = { status: 'loading', user: null, mode: firebaseConfigured ? 'firebase' : 'local', error: '' };
const subs = new Set();
const set = (patch) => {
  Object.assign(S, patch);
  S.v = (S.v || 0) + 1;
  subs.forEach((f) => f());
};
export const getSession = () => S;
export function useSession() {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => S.v || 0,
  );
  return S;
}

// Runs the seed through the real engines (radar, public stats, credential issue) with persistence off.
function applySeed(seed) {
  const backend = getBackend();
  const mode = getMode();
  setBackend(null, mode);
  const { meta, ...data } = seed;
  replaceAll(data);
  runRadar(null, { silent: true });
  db.putMany('publicStats', db.all('institutions').map((i) => computePublicStats(i)));
  const admin = db.find('users', (u) => u.role === 'aicte_admin');
  const e = meta?.studentEnrolmentId && db.get('enrolments', meta.studentEnrolmentId);
  if (e) {
    const c = issueCredential(e, 'Enrolment', admin);
    db.put('credentials', { ...c, digilocker: 'pushed', digilockerAt: new Date().toISOString(), digilockerUri: `in.gov.digilocker.aicte-APAARSETU-${c.id}` });
  }
  audit(admin, 'RADAR_RUN', 'radar', { detail: `${db.all('flags').length} flags raised on initial scan` });
  setBackend(backend, mode);
  return snapshot();
}

export async function boot() {
  try {
    if (firebaseConfigured) {
      setBackend(firebaseBackend, 'firebase');
      const ready = await firebaseBackend.isInitialised();
      if (!ready) return set({ status: 'setup', mode: 'firebase' });
      replaceAll(await firebaseBackend.load(null));
      firebaseBackend.onAuth(async (fbUser) => {
        if (!fbUser) return set({ status: 'ready', user: null });
        const profile = await firebaseBackend.getProfile(fbUser.uid);
        if (!profile || profile.active === false) {
          await firebaseBackend.signOut();
          return set({ status: 'ready', user: null, error: 'No active APAAR-Setu profile for this account.' });
        }
        replaceAll(await firebaseBackend.load(profile));
        firebaseBackend.watch(profile, (col, docs) => db.putLocal(col, docs));
        set({ status: 'ready', user: profile, error: '' });
      });
      return;
    }
    setBackend(localBackend, 'local');
    const data = localBackend.load();
    if (data && data.institutions?.length) replaceAll(data);
    else seedLocal('standard');
    const uid = sessionStorage.getItem(SESSION_KEY);
    set({ status: 'ready', mode: 'local', user: uid ? db.get('users', uid) || null : null });
  } catch (e) {
    console.error(e);
    set({ status: 'error', error: e.message || String(e) });
  }
}

export function seedLocal(size = 'standard') {
  setBackend(localBackend, 'local');
  applySeed(buildSeed({ size }));
  localBackend.flush();
}

export function resetDemo() {
  localBackend.reset();
  sessionStorage.removeItem(SESSION_KEY);
  seedLocal('standard');
  set({ user: null });
}

export async function login(email, password) {
  const em = String(email || '').trim().toLowerCase();
  if (S.mode === 'firebase') {
    set({ status: 'loading' });
    try {
      await firebaseBackend.signIn(em, password);
    } catch (e) {
      set({ status: 'ready' });
      throw new Error(e.code === 'auth/invalid-credential' ? 'Wrong email or password.' : e.message);
    }
    return;
  }
  const u = db.find('users', (x) => x.email.toLowerCase() === em);
  if (!u || u.pwHash !== sha(password)) throw new Error('Wrong email or password.');
  if (u.active === false) throw new Error('This account has been deactivated by an administrator.');
  sessionStorage.setItem(SESSION_KEY, u.id);
  audit(u, 'LOGIN', 'user:' + u.id);
  set({ user: u });
}

export async function logout() {
  if (S.mode === 'firebase') {
    await firebaseBackend.signOut();
    replaceAll(await firebaseBackend.load(null));
  } else sessionStorage.removeItem(SESSION_KEY);
  set({ user: null });
}

export async function reloadData() {
  if (S.mode !== 'firebase') return;
  replaceAll(await firebaseBackend.load(S.user));
}

export async function createUser({ email, name, role, password, ...rest }, actor) {
  const id = S.mode === 'firebase' ? await firebaseBackend.createAccount(email, password) : 'u-' + Math.random().toString(36).slice(2, 10);
  const u = { id, email: email.toLowerCase(), name, role, institutionId: rest.institutionId || '', region: rest.region || '', apaarId: rest.apaarId || '', org: rest.org || '', orgType: rest.orgType || '', title: rest.title || '', active: true, createdAt: new Date().toISOString() };
  if (S.mode === 'local') u.pwHash = sha(password);
  db.put('users', u);
  audit(actor, 'USER_CREATE', 'user:' + id, { detail: `${role} ${email}` });
  return u;
}

export async function changePassword(pw) {
  if (S.mode === 'firebase') return firebaseBackend.changePassword(pw);
  db.put('users', { ...S.user, pwHash: sha(pw) });
  set({ user: db.get('users', S.user.id) });
}

// First-run setup for a fresh Firebase project: creates demo accounts and writes the dataset.
export async function setupFirebase(size, onProgress) {
  onProgress?.('Creating demo sign-in accounts…');
  const userIds = {};
  for (const u of DEMO_USERS) userIds[u.key] = await firebaseBackend.createAccount(u.email, DEMO_PASSWORD);
  onProgress?.('Generating dataset and running validation engines…');
  const data = applySeed(buildSeed({ size, userIds }));
  const pairs = COLS.filter((c) => c !== 'settings').map((c) => [c, data[c].map((d) => (c === 'users' ? { ...d, pwHash: undefined } : d))]);
  pairs.push(['settings', data.settings]);
  await firebaseBackend.bulk(pairs, (n, total) => onProgress?.(`Writing to Firestore: ${n} / ${total} documents`));
  await firebaseBackend.bulk([['settings', [{ id: 'meta', seededAt: new Date().toISOString(), size, version: 1 }]]]);
  onProgress?.('Done. Sign in with any demo account.');
  set({ status: 'loading' });
  await boot();
}

export const demoAccounts = () => DEMO_USERS;
export { firebaseConfigured };
