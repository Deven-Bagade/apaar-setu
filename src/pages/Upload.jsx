import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Page, Card, Tabs, Table, Badge, Callout, Field, toast, Stat } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { CATEGORIES, VCODES } from '../lib/constants';
import { TEMPLATE_COLUMNS, COLUMN_HELP, layer1, normaliseRow, processUpload, programmesOf, prepareIndex } from '../services/enrolment';
import { buildRegistry } from '../data/mockAbc';
import { downloadFile, prng } from '../lib/util';
import { occupancy } from '../services/ledger';

function templateBook(rows, inst) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c, '']))], { header: TEMPLATE_COLUMNS });
  ws['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(14, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'students');
  const help = TEMPLATE_COLUMNS.map((c) => ({ column: c, what_to_enter: COLUMN_HELP[c] }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(help), 'help');
  const progs = programmesOf(inst.id).map((p) => ({ programme_code: p.code, programme: p.course, level: p.level, approved_intake: p.approvedIntake }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(progs), 'programme_codes');
  const cats = Object.entries(CATEGORIES).map(([k, c]) => ({ category: k, meaning: c.label, seat_pool: c.desc, proof_needed: c.proof || '' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cats), 'categories');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

// Sample rows: mostly valid students from the mock ABC registry, plus a few deliberate mistakes.
export function sampleRows(inst, n = 12) {
  const reg = buildRegistry();
  const used = new Set(db.all('enrolments').map((e) => e.apaarId));
  const progs = programmesOf(inst.id);
  const r = prng(Date.now() % 100000);
  const pool = reg.list.filter((p) => !used.has(p.apaarId) && p.nationality === 'Indian' && !p.twinOf).sort(() => r.next() - 0.5);
  const fnPool = reg.list.filter((p) => !used.has(p.apaarId) && p.nationality !== 'Indian');
  const prog = progs.find((p) => occupancy(p).used.W < p.approvedIntake) || progs[0];
  const full = progs.find((p) => occupancy(p).used.W >= p.approvedIntake);
  const row = (p, over = {}) => ({
    apaar_id: p.apaarId, student_name: p.name, dob: p.dob, gender: p.gender, guardian_name: p.guardian,
    phone: String(r.int(7, 9)) + String(r.int(100000000, 999999999)), bank_account: String(r.int(10000000000, 99999999999)),
    email: p.name.toLowerCase().replace(' ', '.') + '@mail.example', nationality: p.nationality, programme_code: prog.code, category: 'REG', proof_ref: '',
    admission_date: new Date().toISOString().slice(0, 10), admission_mode: 'Counselling', institution_student_id: inst.short.replace(/[^A-Z]/g, '') + 'N' + r.int(1000, 9999), ...over,
  });
  const o = occupancy(prog);
  const valid = Math.max(2, Math.min(n, o.cap.W - o.used.W - 3));
  const out = pool.slice(0, valid).map((p) => row(p));
  const bad = pool[valid];
  out.push(row(bad, { apaar_id: bad.apaarId.slice(0, 11) + ((Number(bad.apaarId[11]) + 1) % 10) }));
  out.push(row(pool[valid + 1], { student_name: 'Rakesh ' + pool[valid + 1].name.split(' ')[1] }));
  if (fnPool[0]) out.push(row(fnPool[0], { category: 'FN', proof_ref: '' }));
  out.push(row(pool[valid + 2], { category: 'TFW', proof_ref: 'INC/2026/' + r.int(10000, 99999) }));
  out.push({ ...out[0], institution_student_id: out[0].institution_student_id + 'X' });
  const elsewhere = db.find('enrolments', (e) => e.institutionId !== inst.id && e.status === 'active' && e.level === prog.level);
  if (elsewhere) out.push(row({ apaarId: elsewhere.apaarId, name: elsewhere.name, dob: elsewhere.dob, gender: elsewhere.gender, guardian: elsewhere.guardian, nationality: elsewhere.nationality }));
  if (full) out.push(row(pool[valid + 3], { programme_code: full.code }));
  return out;
}

export default function Upload() {
  useStore();
  const { user } = useSession();
  const inst = db.get('institutions', user.institutionId);
  const [tab, setTab] = useState('excel');
  return (
    <Page kicker={inst.name} title="Upload" subtitle="Three ways in, one validation pipeline: Excel bulk upload, a single-student form, or your ERP through the REST API." guide="upload">
      <Tabs value={tab} onChange={setTab} tabs={[['excel', '1 · Excel bulk upload'], ['form', '2 · Single student'], ['api', '3 · From your ERP (API)']]} />
      {tab === 'excel' && <ExcelUpload inst={inst} user={user} />}
      {tab === 'form' && <FormUpload inst={inst} user={user} />}
      {tab === 'api' && <ApiInfo inst={inst} />}
    </Page>
  );
}

function ExcelUpload({ inst, user }) {
  const nav = useNavigate();
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const rules = db.rules();

  const checked = useMemo(() => {
    const ctx = { institution: inst, programmes: programmesOf(inst.id), rules, seen: new Set() };
    return rows.map((raw) => {
      const row = normaliseRow(raw);
      const { issues } = layer1(row, ctx);
      if (row.apaar_id) ctx.seen.add(row.apaar_id);
      return { id: raw.__row, rowNo: raw.__row, row, issues, raw };
    });
  }, [rows]);
  const okRows = checked.filter((r) => !r.issues.length);

  const read = async (f) => {
    setResult(null);
    setFile(f);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets.students || wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      const data = json.map((r, i) => ({ ...r, __row: i + 2 })).filter((r) => Object.values(r).some((v) => v !== '' && typeof v !== 'number') || r.apaar_id);
      if (!data.length) throw new Error('No rows found. Use the template’s "students" sheet.');
      setRows(data);
      toast(`${data.length} row(s) read from ${f.name}`, 'good');
    } catch (e) {
      toast('Could not read the file: ' + e.message, 'bad');
      setRows([]);
    }
  };

  const send = async (list) => {
    setBusy(true);
    try {
      await prepareIndex(list.map((r) => String(r.apaar_id || '')));
      const res = processUpload(list, { institution: inst, actor: user, source: 'excel', fileName: file?.name || 'upload.xlsx' });
      setResult(res);
      setRows([]);
      toast(`Batch created: ${res.accepted.length} accepted, ${res.held.length} on hold, ${res.rejected.length} rejected`, 'good');
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid g3">
      <div className="col span2" style={{ gap: 16 }}>
        <Card title="Step 1 · Get the template">
          <p className="small">One row per student. The template has a <b>help</b> sheet explaining each column, your <b>programme codes</b> and the <b>categories</b>.</p>
          <div className="row">
            <button className="btn" onClick={() => downloadFile(`apaar_setu_template_${inst.short.replace(/\s/g, '_')}.xlsx`, new Blob([templateBook([], inst)]))}>⬇ Blank template</button>
            <button className="btn sun" onClick={() => downloadFile(`apaar_setu_sample_${inst.short.replace(/\s/g, '_')}.xlsx`, new Blob([templateBook(sampleRows(inst), inst)]))}>⬇ Sample file with test data</button>
          </div>
          <p className="tiny muted mt-s">The sample uses real IDs from the (mock) ABC registry, with a few deliberate mistakes so you can see validation work.</p>
        </Card>
        <Card title="Step 2 · Drop your file">
          <label
            className="empty"
            style={{ display: 'block', cursor: 'pointer', background: drag ? 'var(--yellow-soft)' : undefined, borderColor: drag ? 'var(--ink)' : undefined }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && read(e.dataTransfer.files[0]); }}
          >
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
            <div style={{ fontSize: 28 }}>⇪</div>
            <b>Drag the Excel file here, or click to choose</b>
            <div className="small">.xlsx, .xls or .csv · checked in your browser first, nothing is sent yet</div>
          </label>
          {file && rows.length > 0 && <div className="small mt-s">File: <b>{file.name}</b></div>}
        </Card>
        {checked.length > 0 && (
          <Card title="Step 3 · Check before sending" sub="Layer 1 rules ran in your browser. Rows in red will be rejected; you can still send them and fix them later from the batch.">
            <div className="grid g3 mb">
              <Stat label="Rows" value={checked.length} color="yellow" />
              <Stat label="Look fine" value={okRows.length} color="green" />
              <Stat label="Have problems" value={checked.length - okRows.length} color="red" />
            </div>
            <Table rows={checked} pageSize={8} rowClass={(r) => (r.issues.length ? 'bad' : '')} columns={[
              { key: 'rowNo', label: 'Row', num: true },
              { key: 'apaar', label: 'APAAR ID', render: (r) => <span className={`mono ${r.issues.some((i) => i.field === 'apaar_id') ? 'bad-cell' : ''}`}>{r.row.apaar_id}</span> },
              { key: 'name', label: 'Name', render: (r) => r.row.student_name },
              { key: 'prog', label: 'Prog.', render: (r) => r.row.programme_code },
              { key: 'cat', label: 'Cat.', render: (r) => r.row.category },
              { key: 'issues', label: 'Check', render: (r) => r.issues.length ? r.issues.map((i, k) => <div key={k} className="small"><Badge color="red">{i.code}</Badge> {i.msg}</div>) : <Badge color="green">OK</Badge> },
            ]} />
            <div className="row mt">
              <button className="btn primary" disabled={busy} onClick={() => send(checked.map((c) => c.raw))}>Upload all {checked.length} rows</button>
              <button className="btn" disabled={busy || !okRows.length} onClick={() => send(okRows.map((c) => c.raw))}>Upload only the {okRows.length} good rows</button>
              <button className="btn ghost" onClick={() => { setRows([]); setFile(null); }}>Clear</button>
            </div>
            <p className="tiny muted mt-s">Next the server checks every APAAR ID with ABC (name + DOB), then the Seat Ledger, then whether the student is active at another college.</p>
          </Card>
        )}
        {result && <UploadResult result={result} onOpen={() => nav(`/app/batches/${result.batch.id}`)} />}
      </div>
      <Card title="Columns" sub="What each column needs">
        {TEMPLATE_COLUMNS.map((c) => <div key={c} className="small" style={{ padding: '4px 0', borderBottom: '1px dashed var(--line-soft)' }}><span className="mono strong">{c}</span><div className="muted">{COLUMN_HELP[c]}</div></div>)}
      </Card>
    </div>
  );
}

export function UploadResult({ result, onOpen }) {
  const codes = {};
  result.rejected.forEach((r) => r.issues.forEach((i) => (codes[i.code] = (codes[i.code] || 0) + 1)));
  return (
    <Card title="Result" accent={result.rejected.length ? 'orange' : 'green'} actions={<button className="btn primary" onClick={onOpen}>Open batch →</button>}>
      <div className="grid g3">
        <Stat label="Accepted into ledger" value={result.accepted.length} color="green" />
        <Stat label="On hold (active elsewhere)" value={result.held.length} color="orange" />
        <Stat label="Rejected" value={result.rejected.length} color="red" />
      </div>
      {Object.keys(codes).length > 0 && (
        <div className="mt">
          {Object.entries(codes).map(([c, n]) => <div key={c} className="small"><Badge color="red">{c}</Badge> {n} × {VCODES[c].title}</div>)}
        </div>
      )}
      <p className="small mt">The batch is a <b>Draft</b>. Fix rejected rows inside it, then the Institution Admin signs and submits it to AICTE. A WhatsApp summary was sent to your institution inbox.</p>
    </Card>
  );
}

function FormUpload({ inst, user }) {
  const nav = useNavigate();
  const progs = programmesOf(inst.id);
  const blank = { apaar_id: '', student_name: '', dob: '', gender: '', guardian_name: '', phone: '', bank_account: '', email: '', nationality: 'Indian', programme_code: progs[0]?.code || '', category: 'REG', proof_ref: '', admission_date: new Date().toISOString().slice(0, 10), admission_mode: 'Counselling', institution_student_id: '' };
  const [f, setF] = useState(blank);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState(null);
  const ctx = { institution: inst, programmes: progs, rules: db.rules(), seen: new Set() };
  const issues = layer1(normaliseRow(f), ctx).issues;
  const errOf = (k) => touched && issues.find((i) => i.field === k)?.msg;
  const cat = CATEGORIES[f.category];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fill = () => {
    const s = sampleRows(inst, 1)[0];
    setF({ ...blank, ...s });
    setTouched(false);
  };
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (issues.length) return toast('Please fix the highlighted fields', 'bad');
    await prepareIndex([f.apaar_id]);
    const res = processUpload([{ ...f, __row: 1 }], { institution: inst, actor: user, source: 'form', fileName: 'Web form' });
    setResult(res);
    if (res.accepted.length) {
      toast(`${f.student_name} added to seat ${res.accepted[0].slotLabel}`, 'good');
      setF(blank);
      setTouched(false);
    } else if (res.held.length) toast('Saved, but on hold: the student is active at another college', 'bad');
    else toast(res.rejected[0].issues[0].msg, 'bad');
  };
  const inp = (k, label, help, type = 'text', extra = {}) => (
    <Field label={label} help={help} error={errOf(k)}>
      <input className={`input ${errOf(k) ? 'bad' : ''}`} type={type} value={f[k]} onChange={set(k)} {...extra} />
    </Field>
  );
  return (
    <div className="grid g3">
      <form className="card span2" onSubmit={submit}>
        <div className="card-head"><h3>Add one student</h3><button type="button" className="btn sm sun" onClick={fill}>Fill with a test student</button></div>
        <h4 className="muted small strong">IDENTITY · checked with the ABC registry</h4>
        <div className="form-grid">
          {inp('apaar_id', 'APAAR ID *', '12 digits, from the student’s DigiLocker', 'text', { inputMode: 'numeric', maxLength: 12, placeholder: '123456789012' })}
          {inp('student_name', 'Student name *', 'Exactly as in APAAR')}
          {inp('dob', 'Date of birth *', 'Must match APAAR', 'date')}
          <Field label="Gender *" error={errOf('gender')}><select className={`input ${errOf('gender') ? 'bad' : ''}`} value={f.gender} onChange={set('gender')}><option value="">Choose…</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></select></Field>
          {inp('guardian_name', 'Guardian name', 'Father / mother / guardian')}
          {inp('nationality', 'Nationality *', 'Indian, or the country for FN / OCI')}
        </div>
        <h4 className="muted small strong mt">CONTACT · stored encrypted</h4>
        <div className="form-grid">
          {inp('phone', 'Mobile', '10 digits', 'tel', { maxLength: 10 })}
          {inp('email', 'Email', 'Optional', 'email')}
          {inp('bank_account', 'Bank account', 'Optional, for scholarship checks')}
        </div>
        <h4 className="muted small strong mt">ADMISSION · checked with the Seat Ledger</h4>
        <div className="form-grid">
          <Field label="Programme *" error={errOf('programme_code')}><select className="input" value={f.programme_code} onChange={set('programme_code')}>{progs.map((p) => { const o = occupancy(p); return <option key={p.code} value={p.code}>{p.course} — {o.cap.W - o.used.W} regular seats free</option>; })}</select></Field>
          <Field label="Category *" help={cat?.desc}><select className="input" value={f.category} onChange={set('category')}>{Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></Field>
          {cat?.proof ? inp('proof_ref', 'Proof reference *', cat.proof) : <Field label="Proof reference" help="Not needed for Regular"><input className="input" disabled value="" /></Field>}
          {inp('admission_date', 'Admission date *', '', 'date')}
          <Field label="Admission mode"><select className="input" value={f.admission_mode} onChange={set('admission_mode')}>{['Counselling', 'Management', 'Institute', 'Lateral'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          {inp('institution_student_id', 'Roll / registration no. *', 'Your college’s ID for this student')}
        </div>
        {touched && issues.length > 0 && <Callout kind="bad" title="Please fix:">{issues.map((i) => <div key={i.code + i.field} className="small">{i.code}: {i.msg}</div>)}</Callout>}
        <div className="row mt">
          <button className="btn primary">Check &amp; add student</button>
          <button type="button" className="btn ghost" onClick={() => { setF(blank); setTouched(false); }}>Clear</button>
        </div>
      </form>
      <div className="col" style={{ gap: 16 }}>
        <Card title="What happens when you click">
          <div className="pill-steps small">
            <div>Instant checks: format, checksum, dates, category vs nationality, proof.</div>
            <div>APAAR is matched with ABC: name (≥ {Math.round(db.rules().nameMatchMin * 100)}% similar) and date of birth.</div>
            <div>The Seat Ledger gives the student a free slot of the chosen category, or blocks it.</div>
            <div>If the student is active at another college the admission is put on hold for AICTE.</div>
          </div>
        </Card>
        {result && <UploadResult result={result} onOpen={() => nav(`/app/batches/${result.batch.id}`)} />}
      </div>
    </div>
  );
}

function ApiInfo({ inst }) {
  const body = JSON.stringify({ institutionId: inst.id, rows: [{ apaar_id: '…', student_name: '…', dob: 'YYYY-MM-DD', gender: 'F', programme_code: programmesOf(inst.id)[0]?.code, category: 'REG', admission_date: 'YYYY-MM-DD', institution_student_id: '…', nationality: 'Indian' }] }, null, 2);
  return (
    <div className="grid g2">
      <Card title="Push admissions from your ERP">
        <p>Your college ERP can send students straight to APAAR-Setu. The same validation runs, and the result comes back as JSON with reason codes.</p>
        <pre className="hash" style={{ background: 'var(--cream)', padding: 10, border: '1.5px solid var(--ink)', whiteSpace: 'pre-wrap' }}>{`POST /api/v1/enrolments
Authorization: Bearer <institution API key>
Content-Type: application/json

${body}`}</pre>
        <Link className="btn primary" to="/app/api">Try it in the API sandbox →</Link>
      </Card>
      <Card title="Response">
        <pre className="hash" style={{ background: 'var(--cream)', padding: 10, border: '1.5px solid var(--ink)', whiteSpace: 'pre-wrap' }}>{`200 OK
{
  "batchId": "B…",
  "accepted": [{ "apaarId": "…", "slot": "W-23" }],
  "held": [],
  "rejected": [{ "row": 3, "code": "V02",
     "message": "APAAR found, but date of birth does not match ABC." }]
}`}</pre>
        <p className="small muted">Webhooks (batch.verified, flag.raised) and OAuth 2.0 client credentials are described in the OpenAPI spec available in the sandbox.</p>
      </Card>
    </div>
  );
}
