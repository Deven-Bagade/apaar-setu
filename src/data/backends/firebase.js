// Firebase backend (free Spark plan): Firebase Auth + Cloud Firestore.
// Each role loads only the documents it is allowed to see; firestore.rules enforces the same scopes.
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  connectAuthEmulator, updatePassword,
} from 'firebase/auth';
import {
  initializeFirestore, collection, getDocs, getDoc, query, where, doc, setDoc, deleteDoc, writeBatch,
  runTransaction, onSnapshot, connectFirestoreEmulator, documentId,
} from 'firebase/firestore';
import { REGIONS } from '../../lib/constants';

const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = !!(cfg.apiKey && cfg.projectId) && env.VITE_DATA_MODE !== 'local';

let app = null;
let auth = null;
let fs = null;
const unsubs = [];

function init() {
  if (app) return;
  app = initializeApp(cfg);
  auth = getAuth(app);
  fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
  if (env.VITE_USE_EMULATOR === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  }
}

const clean = (d) => JSON.parse(JSON.stringify(d));

async function q(col, ...conds) {
  const ref = conds.length ? query(collection(fs, col), ...conds) : collection(fs, col);
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function qSafe(col, ...conds) {
  try {
    return await q(col, ...conds);
  } catch (e) {
    console.warn('Firestore read skipped for', col, e.code || e.message);
    return [];
  }
}
const inChunks = async (col, field, values) => {
  const out = [];
  for (let i = 0; i < values.length; i += 10) {
    if (values.slice(i, i + 10).length) out.push(...(await qSafe(col, where(field, 'in', values.slice(i, i + 10)))));
  }
  return out;
};

export const firebaseBackend = {
  name: 'firebase',
  init,
  async isInitialised() {
    init();
    try {
      const m = await getDoc(doc(fs, 'settings', 'meta'));
      return m.exists();
    } catch {
      return false;
    }
  },
  // Role-scoped load. Returns an object of collection -> docs.
  async load(user) {
    init();
    const out = {};
    out.institutions = await qSafe('institutions');
    out.programmes = await qSafe('programmes');
    out.publicStats = await qSafe('publicStats');
    out.settings = await qSafe('settings');
    if (!user) return out;
    const role = user.role;
    if (role === 'aicte_admin') {
      // ledger and audit are large and are loaded on demand by their pages (loadCollection).
      for (const c of ['users', 'enrolments', 'batches', 'flags', 'consents', 'accessLog', 'credentials', 'scholarships', 'merkle', 'notifications']) {
        out[c] = await qSafe(c);
      }
      out.ledger = await qSafe('ledger', where('action', '==', 'BLOCKED'));
    } else if (role === 'regional_officer') {
      const states = REGIONS[user.region]?.states || [];
      for (const c of ['enrolments', 'batches', 'ledger', 'flags', 'scholarships']) out[c] = await inChunks(c, 'state', states);
      out.users = await qSafe('users', where(documentId(), '==', user.id));
      out.notifications = await qSafe('notifications', where('to', 'in', [user.id, user.region]));
    } else if (role === 'institution_admin' || role === 'data_clerk') {
      const I = user.institutionId;
      for (const c of ['enrolments', 'batches', 'ledger', 'flags', 'credentials']) out[c] = await qSafe(c, where('institutionId', '==', I));
      out.users = await qSafe('users', where('institutionId', '==', I));
      out.notifications = await qSafe('notifications', where('to', 'in', [user.id, I]));
    } else if (role === 'student') {
      for (const c of ['enrolments', 'credentials', 'consents', 'accessLog']) out[c] = await qSafe(c, where('apaarId', '==', user.apaarId || '-'));
      out.users = await qSafe('users', where(documentId(), '==', user.id));
      out.notifications = await qSafe('notifications', where('to', 'in', [user.id, 'apaar:' + (user.apaarId || '-')]));
    } else if (role === 'verifier') {
      out.consents = await qSafe('consents', where('requesterId', '==', user.id));
      out.accessLog = await qSafe('accessLog', where('actorId', '==', user.id));
      out.users = await qSafe('users', where(documentId(), '==', user.id));
      out.notifications = await qSafe('notifications', where('to', '==', user.id));
    }
    return out;
  },
  // On-demand load of a big collection, optionally filtered by one field.
  async loadCollection(col, field, value) {
    init();
    return field ? qSafe(col, where(field, '==', value)) : qSafe(col);
  },
  // Live updates for the small collections people wait on (consents, notifications).
  watch(user, onDocs) {
    init();
    unsubs.splice(0).forEach((u) => u());
    if (!user) return;
    const add = (col, ...conds) => {
      try {
        unsubs.push(onSnapshot(query(collection(fs, col), ...conds), (s) => onDocs(col, s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}));
      } catch {
        /* ignore */
      }
    };
    if (user.role === 'student') add('consents', where('apaarId', '==', user.apaarId || '-'));
    if (user.role === 'verifier') add('consents', where('requesterId', '==', user.id));
    if (user.role === 'student') add('notifications', where('to', 'in', [user.id, 'apaar:' + (user.apaarId || '-')]));
    if (user.role === 'verifier') add('notifications', where('to', '==', user.id));
    if (['institution_admin', 'data_clerk'].includes(user.role)) add('notifications', where('to', 'in', [user.id, user.institutionId]));
  },
  save(col, d) {
    init();
    setDoc(doc(fs, col, d.id), clean(d)).catch((e) => console.warn('save failed', col, d.id, e.code || e.message));
  },
  saveMany(col, docs) {
    init();
    this.bulk([[col, docs]]).catch((e) => console.warn('batch save failed', col, e.code || e.message));
  },
  async bulk(pairs, onProgress) {
    init();
    const all = pairs.flatMap(([col, docs]) => docs.map((d) => [col, d]));
    for (let i = 0; i < all.length; i += 400) {
      const b = writeBatch(fs);
      all.slice(i, i + 400).forEach(([col, d]) => b.set(doc(fs, col, d.id), clean(d)));
      await b.commit();
      onProgress?.(Math.min(all.length, i + 400), all.length);
    }
  },
  remove(col, id) {
    init();
    deleteDoc(doc(fs, col, id)).catch(() => {});
  },
  async fetchByIds(col, ids) {
    init();
    const out = [];
    for (const id of ids) {
      try {
        const s = await getDoc(doc(fs, col, id));
        if (s.exists()) out.push({ id: s.id, ...s.data() });
      } catch {
        /* not allowed or missing */
      }
    }
    return out;
  },
  // Append-only audit chain. A transaction on settings/auditHead keeps seq and prevHash consistent across users.
  async appendAudit(build) {
    init();
    return runTransaction(fs, async (t) => {
      const headRef = doc(fs, 'settings', 'auditHead');
      const head = await t.get(headRef);
      const h = head.exists() ? head.data() : { seq: 0, hash: 'GENESIS' };
      const entry = build(h.seq + 1, h.hash);
      t.set(doc(fs, 'audit', entry.id), clean(entry));
      t.set(headRef, { id: 'auditHead', seq: entry.seq, hash: entry.hash });
      return entry;
    });
  },
  // ---- Auth ----
  onAuth(cb) {
    init();
    return onAuthStateChanged(auth, cb);
  },
  async signIn(email, pw) {
    init();
    const c = await signInWithEmailAndPassword(auth, email, pw);
    return c.user.uid;
  },
  async signOut() {
    init();
    unsubs.splice(0).forEach((u) => u());
    await signOut(auth);
  },
  async getProfile(uid) {
    init();
    const s = await getDoc(doc(fs, 'users', uid));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  },
  async changePassword(pw) {
    init();
    await updatePassword(auth.currentUser, pw);
  },
  // Creates an Auth account without signing the current user out (secondary app instance).
  async createAccount(email, pw) {
    init();
    const sec = initializeApp(cfg, 'secondary-' + Date.now());
    const sa = getAuth(sec);
    if (env.VITE_USE_EMULATOR === 'true') connectAuthEmulator(sa, 'http://127.0.0.1:9099', { disableWarnings: true });
    try {
      const c = await createUserWithEmailAndPassword(sa, email, pw);
      return c.user.uid;
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        const c = await signInWithEmailAndPassword(sa, email, pw);
        return c.user.uid;
      }
      throw e;
    } finally {
      await signOut(sa).catch(() => {});
      await deleteApp(sec).catch(() => {});
    }
  },
};
