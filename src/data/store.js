// In-memory store with a pluggable persistence backend.
// Demo mode -> browser localStorage. Firebase mode -> Cloud Firestore (free Spark plan).
import { useSyncExternalStore } from 'react';
import { DEFAULT_RULES } from '../lib/constants';

export const COLS = [
  'users', 'institutions', 'programmes', 'enrolments', 'batches', 'ledger', 'flags', 'consents',
  'accessLog', 'credentials', 'scholarships', 'audit', 'merkle', 'notifications', 'settings', 'publicStats', 'apaarIndex',
];

const S = { data: {}, version: 0, backend: null, mode: 'local', idx: {} };
COLS.forEach((c) => (S.data[c] = []));
const listeners = new Set();
let depth = 0;
let pending = false;

function emit() {
  S.idx = {};
  if (depth > 0) {
    pending = true;
    return;
  }
  S.version++;
  listeners.forEach((f) => f());
}

export function setBackend(backend, mode) {
  S.backend = backend;
  S.mode = mode;
}
export const getMode = () => S.mode;
export const getBackend = () => S.backend;

export function replaceAll(data) {
  COLS.forEach((c) => (S.data[c] = Array.isArray(data?.[c]) ? data[c] : []));
  emit();
}
export const snapshot = () => S.data;

export const db = {
  all: (col) => S.data[col] || [],
  get(col, id) {
    if (!S.idx[col]) S.idx[col] = new Map((S.data[col] || []).map((d) => [d.id, d]));
    return S.idx[col].get(id);
  },
  where: (col, f) => (S.data[col] || []).filter(f),
  find: (col, f) => (S.data[col] || []).find(f),
  put(col, doc) {
    const arr = S.data[col];
    const i = arr.findIndex((d) => d.id === doc.id);
    const next = { ...(i >= 0 ? arr[i] : {}), ...doc };
    if (i >= 0) arr[i] = next;
    else arr.push(next);
    S.backend?.save(col, next);
    emit();
    return next;
  },
  putMany(col, docs) {
    if (!docs.length) return;
    const arr = S.data[col];
    const pos = new Map(arr.map((d, i) => [d.id, i]));
    const saved = docs.map((doc) => {
      const i = pos.get(doc.id);
      const next = { ...(i !== undefined ? arr[i] : {}), ...doc };
      if (i !== undefined) arr[i] = next;
      else {
        pos.set(doc.id, arr.length);
        arr.push(next);
      }
      return next;
    });
    S.backend?.saveMany(col, saved);
    emit();
  },
  // Update memory only (used when the backend already wrote the document).
  putLocal(col, docs) {
    const arr = S.data[col];
    (Array.isArray(docs) ? docs : [docs]).forEach((doc) => {
      const i = arr.findIndex((d) => d.id === doc.id);
      if (i >= 0) arr[i] = { ...arr[i], ...doc };
      else arr.push(doc);
    });
    emit();
  },
  setCollection(col, docs) {
    S.data[col] = docs;
    emit();
  },
  remove(col, id) {
    S.data[col] = S.data[col].filter((d) => d.id !== id);
    S.backend?.remove(col, id);
    emit();
  },
  // Group several writes into one re-render.
  tx(fn) {
    depth++;
    try {
      return fn();
    } finally {
      depth--;
      if (depth === 0 && pending) {
        pending = false;
        emit();
      }
    }
  },
  rules() {
    const r = db.get('settings', 'rules');
    return { ...DEFAULT_RULES, ...(r || {}) };
  },
};

export function useStore() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => S.version,
  );
}
export const forceRefresh = emit;
