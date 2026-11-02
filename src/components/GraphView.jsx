// Network view for the Ghost Student Radar (d3-force layout, rendered as SVG).
import { useMemo, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

const COLORS = { student: 'var(--yellow)', institution: 'var(--red)', phone: 'var(--orange)', bank: 'var(--green)' };

export default function GraphView({ graph, height = 460, onNode }) {
  const [hover, setHover] = useState(null);
  const W = 900;
  const layout = useMemo(() => {
    const nodes = graph.nodes.map((n) => ({ ...n }));
    const links = graph.links.map((l) => ({ ...l }));
    if (!nodes.length) return { nodes, links };
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((d) => d.id).distance((l) => (l.kind === 'enrolled' ? 95 : 70)).strength(0.6))
      .force('charge', forceManyBody().strength(-320))
      .force('center', forceCenter(W / 2, height / 2))
      .force('collide', forceCollide(34))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();
    // Fit the drawing to the frame so small networks are not lost in empty space.
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - 120) / Math.max(1, x1 - x0), (height - 70) / Math.max(1, y1 - y0), 2.2);
    nodes.forEach((n) => {
      n.x = W / 2 + (n.x - (x0 + x1) / 2) * k;
      n.y = height / 2 + (n.y - (y0 + y1) / 2) * k;
    });
    return { nodes, links };
  }, [graph, height]);

  if (!layout.nodes.length) return <div className="empty">No connected records for this selection.</div>;
  return (
    <div className="graph">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Network of flagged records">
        {layout.links.map((l, i) => (
          <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
            stroke={l.flag ? 'var(--red)' : '#a8957a'} strokeWidth={l.flag ? 2.2 : 1.2} strokeDasharray={l.kind === 'similar' ? '5 4' : undefined} />
        ))}
        {layout.nodes.map((n) => {
          const c = COLORS[n.kind];
          const s = n.kind === 'institution' ? 15 : 9;
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} onClick={() => onNode?.(n)} style={{ cursor: onNode ? 'pointer' : 'default' }}>
              {n.kind === 'institution' && <rect x={-s} y={-s} width={s * 2} height={s * 2} fill={c} stroke="var(--ink)" strokeWidth="2" />}
              {n.kind === 'student' && <circle r={s} fill={c} stroke="var(--ink)" strokeWidth="2" />}
              {(n.kind === 'phone' || n.kind === 'bank') && <polygon points={`0,${-s - 4} ${s + 4},0 0,${s + 4} ${-s - 4},0`} fill={c} stroke="var(--ink)" strokeWidth="2" />}
              <text y={s + 13} textAnchor="middle" fontSize="11" fontWeight={n.kind === 'institution' ? 700 : 500} fill="var(--ink)">{n.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend mt-s">
        <span><i className="dot" style={{ background: COLORS.student, borderRadius: '50%' }} /> Student</span>
        <span><i className="dot" style={{ background: COLORS.institution }} /> Institution</span>
        <span><i className="dot" style={{ background: COLORS.phone }} /> Shared phone</span>
        <span><i className="dot" style={{ background: COLORS.bank }} /> Shared bank a/c</span>
        <span><i style={{ width: 18, borderTop: '2px solid var(--red)', display: 'inline-block' }} /> Suspicious link</span>
        <span><i style={{ width: 18, borderTop: '2px dashed var(--red)', display: 'inline-block' }} /> Look-alike identity</span>
        {hover && <span className="strong">· {hover.label}{hover.sub ? ` (${hover.sub})` : ''}</span>}
      </div>
    </div>
  );
}
