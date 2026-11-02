import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Page, Card, Badge, Bar, Table, Modal, KV, Callout } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db, getMode, getBackend } from '../data/store';
import { visibleInstitutions } from '../data/scope';
import { CATEGORIES, GROUPS } from '../lib/constants';
import { capacity, occupancy, slotGrid, checkSeat, replay } from '../services/ledger';
import { fmtDateTime, fmtDate } from '../lib/util';

const ACTION_COLOR = { OCCUPY: 'green', VACATE: 'grey', BLOCKED: 'red', HOLD: 'orange', RELEASE: 'teal' };

export default function Ledger() {
  useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const insts = visibleInstitutions(user);
  const rules = db.rules();
  const progs = db.where('programmes', (p) => insts.some((i) => i.id === p.institutionId) && p.academicYear === rules.academicYear && (!sp.get('inst') || p.institutionId === sp.get('inst')));
  const progId = sp.get('prog') && progs.some((p) => p.id === sp.get('prog')) ? sp.get('prog') : progs[0]?.id;
  const prog = db.get('programmes', progId);
  const [seat, setSeat] = useState(null);
  const [tryCat, setTryCat] = useState('REG');
  const [tryRes, setTryRes] = useState(null);
  const [asOf, setAsOf] = useState(null);

  useEffect(() => {
    setTryRes(null);
    setAsOf(null);
    if (getMode() === 'firebase' && progId) getBackend().loadCollection('ledger', 'programmeId', progId).then((docs) => docs.length && db.putLocal('ledger', docs));
  }, [progId]);

  const { events, series } = useMemo(() => (prog ? replay(prog.id) : { events: [], series: [] }), [prog, db.all('ledger').length]);
  // Replay: seats occupied as of a chosen day.
  const days = series.map((s) => s.day);
  const replayHolders = useMemo(() => {
    if (!asOf) return null;
    const m = new Map();
    events.filter((e) => e.at.slice(0, 10) <= asOf).forEach((e) => {
      if (e.action === 'OCCUPY' || e.action === 'HOLD') m.set(e.slotLabel, e);
      if (e.action === 'VACATE') m.delete(e.slotLabel);
    });
    return m;
  }, [asOf, events]);
  if (!prog) return <Page title="Seat Ledger"><Callout kind="info">No programmes in your scope.</Callout></Page>;
  const inst = db.get('institutions', prog.institutionId);
  const cap = capacity(prog, rules);
  const occ = occupancy(prog, rules);
  const grid = slotGrid(prog, rules);


  return (
    <Page kicker={`${inst.name}`} title="Seat Ledger" subtitle="Approved intake as numbered seat slots. A student exists for AICTE only by holding one." guide="ledger"
      actions={
        <select className="input" style={{ minWidth: 300 }} value={progId} onChange={(e) => setSp({ prog: e.target.value })} aria-label="Programme">
          {progs.map((p) => <option key={p.id} value={p.id}>{db.get('institutions', p.institutionId)?.short} · {p.course} ({p.approvedIntake})</option>)}
        </select>
      }>
      <div className="grid g6">
        {Object.entries(GROUPS).map(([g, info]) => (
          <div key={g} className="card tight flat">
            <div className="small strong">{info.label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800 }}>{occ.used[g]}<span className="muted" style={{ fontSize: 15 }}> / {cap[g]}</span></div>
            <Bar value={occ.used[g]} max={cap[g] || 1} color={occ.used[g] >= cap[g] && cap[g] ? 'var(--orange)' : 'var(--green)'} />
          </div>
        ))}
        <div className="card tight flat">
          <div className="small strong">NRI sub-cap (within intake)</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800 }}>{occ.used.NRI}<span className="muted" style={{ fontSize: 15 }}> / {cap.nriCap}</span></div>
          <Bar value={occ.used.NRI} max={cap.nriCap || 1} />
        </div>
      </div>

      <div className="grid g3 mt">
        <Card className="span2" title={asOf ? `Seats as of ${fmtDate(asOf)} (replay)` : 'Seat map (today)'} sub="Click an occupied seat to see the student"
          actions={asOf && <button className="btn sm" onClick={() => setAsOf(null)}>Back to today</button>}>
          <div className="legend mb">
            <span><i className="sw on" /> Occupied</span>
            <span><i className="sw pend" /> Uploaded, not yet AICTE-verified</span>
            <span><i className="sw held" /> On hold</span>
            <span><i className="sw empty" /> Free</span>
          </div>
          {Object.entries(grid).filter(([g]) => cap[g] > 0).map(([g, slots]) => (
            <div key={g} className="mb">
              <div className="small strong mb" style={{ marginBottom: 4 }}>{GROUPS[g].label}</div>
              <div className="seat-grid">
                {slots.map((s) => {
                  const h = replayHolders ? replayHolders.get(s.label) : s.holder;
                  const held = h && (h.recordState === 'on_hold' || h.action === 'HOLD');
                  const pend = h && !held && h.recordState && h.recordState !== 'aicte_verified';
                  return (
                    <div key={s.label} className={`seat ${h ? (held ? 'held' : pend ? 'pend' : 'on') : 'empty'}`} title={h ? `${s.label}: ${h.name}` : `${s.label}: free`}
                      onClick={() => h && setSeat({ ...s, holder: h.recordState ? h : db.find('enrolments', (e) => e.apaarId === h.apaarId && e.programmeId === prog.id) || h })}>
                      {s.label}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
        <div className="col" style={{ gap: 16 }}>
          <Card title="Try to admit one more" accent="red" sub="See the ledger decision without saving anything">
            <div className="row">
              <select className="input" style={{ flex: 1 }} value={tryCat} onChange={(e) => { setTryCat(e.target.value); setTryRes(null); }} aria-label="Category">
                {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
              </select>
              <button className="btn primary" onClick={() => setTryRes(checkSeat(prog, tryCat, [], rules))}>Check</button>
            </div>
            {tryRes && (tryRes.ok
              ? <div className="callout good mt"><b>Allowed</b>The student would take slot <span className="mono">{tryRes.label}</span>.{CATEGORIES[tryCat].proof && <> Proof needed: {CATEGORIES[tryCat].proof}.</>}</div>
              : <div className="callout bad mt"><b>Blocked (V03)</b>{tryRes.reason}</div>)}
          </Card>
          <Card title="Replay admissions" sub="Seats occupied over time">
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={series} margin={{ top: 6, right: 6, left: -22, bottom: 0 }} onClick={(e) => e?.activeLabel && setAsOf(e.activeLabel)}>
                <CartesianGrid stroke="#e3d5b5" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} /><YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} />
                <ReferenceLine y={cap.W} stroke="#c4372a" strokeDasharray="4 3" label={{ value: 'intake', fontSize: 10, fill: '#c4372a' }} />
                <Area type="stepAfter" dataKey="occupied" stroke="#3c7a47" fill="#d3e6c9" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            {days.length > 0 && (
              <div className="col mt-s">
                <input type="range" min={0} max={days.length - 1} value={asOf ? days.indexOf(asOf) : days.length - 1} onChange={(e) => setAsOf(days[Number(e.target.value)])} aria-label="Replay date" />
                <span className="small muted">Drag or click the chart to see the seat map on any day.</span>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt">
        <Card title="Ledger events" sub="Append-only history of this programme">
          <Table rows={[...events].reverse()} pageSize={10} search="Search name, APAAR or slot…" searchKeys={['name', 'apaarId', 'slotLabel', 'action']}
            columns={[
              { key: 'at', label: 'When', render: (e) => fmtDateTime(e.at) },
              { key: 'action', label: 'Event', render: (e) => <Badge color={ACTION_COLOR[e.action]}>{e.action}</Badge> },
              { key: 'slotLabel', label: 'Slot', render: (e) => <span className="mono">{e.slotLabel || '—'}</span> },
              { key: 'category', label: 'Category' },
              { key: 'name', label: 'Student', render: (e) => <>{e.name}<div className="mono tiny muted">{e.apaarId}</div></> },
              { key: 'note', label: 'Note', render: (e) => <span className="small">{e.note || ''}</span> },
              { key: 'by', label: 'By' },
            ]} />
        </Card>
      </div>

      {seat && (
        <Modal title={`Seat ${seat.label}`} onClose={() => setSeat(null)} footer={seat.holder?.id && <button className="btn primary" onClick={() => nav(`/app/students/${seat.holder.id}`)}>Open student record →</button>}>
          <KV items={[
            ['Student', seat.holder.name],
            ['APAAR ID', <span className="mono" key="a">{seat.holder.apaarId}</span>],
            ['Category', CATEGORIES[seat.holder.category]?.label],
            ['Admitted', fmtDate(seat.holder.admissionDate || seat.holder.at)],
            ['Record state', seat.holder.recordState?.replace(/_/g, '-')],
            seat.holder.holdReason && ['On hold because', seat.holder.holdReason],
          ]} />
        </Modal>
      )}
      <p className="small muted mt">Caps come from <Link to="/app/rules">Rules &amp; settings</Link> (AICTE admin).</p>
    </Page>
  );
}
