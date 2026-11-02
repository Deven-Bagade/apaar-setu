// Tamper-evident audit trail: every write is appended to a hash chain.
// hash(n) = H(hash(n-1) + canonical(entry n)). A daily Merkle root of the hashes is published,
// so any back-dated edit breaks either the chain or the published root.
import { db, getBackend } from '../data/store';
import { sha, canon } from '../lib/crypto';

const body = (e) => ({ seq: e.seq, actorId: e.actorId, actorName: e.actorName, role: e.role, action: e.action, object: e.object, detail: e.detail || '', beforeHash: e.beforeHash, afterHash: e.afterHash, at: e.at, prevHash: e.prevHash });

export function makeEntry(seq, prevHash, { actor, action, object, detail, before, after, at }) {
  const e = {
    seq,
    actorId: actor?.id || 'system',
    actorName: actor?.name || 'System',
    role: actor?.role || 'system',
    action,
    object,
    detail: detail || '',
    beforeHash: before ? sha(canon(before)) : '',
    afterHash: after ? sha(canon(after)) : '',
    at: at || new Date().toISOString(),
    prevHash,
  };
  return { id: 'A' + String(seq).padStart(7, '0'), ...e, hash: sha(prevHash + canon(body(e))) };
}

export function audit(actor, action, object, opts = {}) {
  const backend = getBackend();
  const args = { actor, action, object, ...opts };
  if (backend?.appendAudit) {
    backend
      .appendAudit((seq, prev) => makeEntry(seq, prev, args))
      .then((entry) => {
        if (actor?.role === 'aicte_admin') db.putLocal('audit', entry);
      })
      .catch((e) => console.warn('audit append failed', e));
    return;
  }
  const all = db.all('audit');
  const last = all.length ? all.reduce((a, b) => (a.seq > b.seq ? a : b)) : null;
  const entry = makeEntry((last?.seq || 0) + 1, last?.hash || 'GENESIS', args);
  db.put('audit', entry);
  db.put('settings', { id: 'auditHead', seq: entry.seq, hash: entry.hash });
}

export function verifyChain(entries = db.all('audit')) {
  const list = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = 'GENESIS';
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (i === 0 && e.seq !== 1) prev = e.prevHash; // partial view: start from first loaded entry
    const expect = sha(prev + canon(body(e)));
    if (e.prevHash !== prev || e.hash !== expect) {
      return { ok: false, checked: i, brokenAt: e.seq, entry: e, reason: e.prevHash !== prev ? 'Link to previous entry is broken' : 'Entry content does not match its hash' };
    }
    prev = e.hash;
  }
  return { ok: true, checked: list.length };
}

export function merkleRoot(hashes) {
  if (!hashes.length) return '';
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha(level[i] + (level[i + 1] || level[i])));
    level = next;
  }
  return level[0];
}

export const entriesOn = (date) => db.all('audit').filter((e) => e.at.slice(0, 10) === date).sort((a, b) => a.seq - b.seq);

export function publishRoot(date, actor) {
  const list = entriesOn(date);
  const root = merkleRoot(list.map((e) => e.hash));
  const doc = { id: date, date, root, count: list.length, firstSeq: list[0]?.seq || 0, lastSeq: list.at(-1)?.seq || 0, publishedAt: new Date().toISOString(), by: actor?.name || 'System' };
  db.put('merkle', doc);
  return doc;
}

export function checkRoots() {
  return db.all('merkle').map((m) => {
    const now = merkleRoot(entriesOn(m.date).map((e) => e.hash));
    return { ...m, current: now, ok: now === m.root };
  });
}
