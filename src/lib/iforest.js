// Minimal Isolation Forest (Liu, Ting & Zhou, 2008) for institution-level outlier detection.
import { prng } from './util';

const c = (n) => (n <= 1 ? 0 : 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n);

function build(rows, depth, maxDepth, r) {
  if (depth >= maxDepth || rows.length <= 1) return { size: rows.length };
  const dims = rows[0].length;
  const f = r.int(0, dims - 1);
  const vals = rows.map((x) => x[f]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) return { size: rows.length };
  const split = min + r.next() * (max - min);
  return { f, split, left: build(rows.filter((x) => x[f] < split), depth + 1, maxDepth, r), right: build(rows.filter((x) => x[f] >= split), depth + 1, maxDepth, r) };
}
function pathLen(x, node, d) {
  if (node.size !== undefined) return d + c(node.size);
  return pathLen(x, x[node.f] < node.split ? node.left : node.right, d + 1);
}

// Returns an anomaly score in [0,1] per row; > ~0.6 is unusual.
export function isolationForest(data, { trees = 150, sample = 16, seed = 7 } = {}) {
  if (data.length < 4) return data.map(() => 0);
  const r = prng(seed);
  const n = Math.min(sample, data.length);
  const maxDepth = Math.ceil(Math.log2(n));
  const forest = [];
  for (let t = 0; t < trees; t++) {
    const s = [];
    for (let i = 0; i < n; i++) s.push(data[r.int(0, data.length - 1)]);
    forest.push(build(s, 0, maxDepth, r));
  }
  return data.map((x) => {
    const avg = forest.reduce((a, tr) => a + pathLen(x, tr, 0), 0) / forest.length;
    return Math.round(Math.pow(2, -avg / c(n)) * 1000) / 1000;
  });
}
