// Demo-mode backend: whole dataset kept in the browser's localStorage.
import { snapshot } from '../store';

const KEY = 'apaar-setu-data-v1';
let timer = null;

function flush() {
  timer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot()));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}
const schedule = () => {
  if (!timer) timer = setTimeout(flush, 300);
};

export const localBackend = {
  name: 'local',
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save: schedule,
  saveMany: schedule,
  remove: schedule,
  flush,
  reset() {
    localStorage.removeItem(KEY);
  },
};
