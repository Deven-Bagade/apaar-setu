// What each role is allowed to see. Used by every page (and mirrored in firestore.rules).
import { db } from './store';
import { REGIONS } from '../lib/constants';

export function visibleInstitutions(user) {
  if (!user) return [];
  const all = db.all('institutions');
  if (user.role === 'aicte_admin') return all;
  if (user.role === 'regional_officer') {
    const st = REGIONS[user.region]?.states || [];
    return all.filter((i) => st.includes(i.state));
  }
  if (['institution_admin', 'data_clerk'].includes(user.role)) return all.filter((i) => i.id === user.institutionId);
  return [];
}

export function visibleEnrolments(user) {
  if (!user) return [];
  if (user.role === 'student') return db.where('enrolments', (e) => e.apaarId === user.apaarId);
  const ids = new Set(visibleInstitutions(user).map((i) => i.id));
  return db.where('enrolments', (e) => ids.has(e.institutionId));
}

export function visibleFlags(user) {
  if (!user) return [];
  const ids = new Set(visibleInstitutions(user).map((i) => i.id));
  return db.where('flags', (f) => (f.refs?.institutionIds || [f.institutionId]).some((x) => ids.has(x)));
}

export function visibleBatches(user) {
  const ids = new Set(visibleInstitutions(user).map((i) => i.id));
  return db.where('batches', (b) => ids.has(b.institutionId)).sort((a, b) => b.at.localeCompare(a.at));
}

export const canSeeInstitution = (user, instId) => visibleInstitutions(user).some((i) => i.id === instId);

export const scopeLabel = (user) => {
  if (!user) return '';
  if (user.role === 'aicte_admin') return 'All India';
  if (user.role === 'regional_officer') return `${REGIONS[user.region]?.name} region (${REGIONS[user.region]?.states.join(', ')})`;
  if (user.institutionId) return db.get('institutions', user.institutionId)?.name || '';
  if (user.role === 'student') return 'Your records';
  return user.org || '';
};
