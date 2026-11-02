import { useState } from 'react';
import { Page, Table, Badge, Modal, Field, toast, Callout } from '../components/ui';
import { useSession, createUser } from '../data/session';
import { useStore, db } from '../data/store';
import { ROLES, REGIONS } from '../lib/constants';
import { audit } from '../services/audit';
import { fmtDate } from '../lib/util';

export default function Users() {
  useStore();
  const { user } = useSession();
  const [modal, setModal] = useState(false);
  const isAdmin = user.role === 'aicte_admin';
  const rows = db.where('users', (u) => isAdmin || u.institutionId === user.institutionId);
  const toggle = (u) => {
    if (u.id === user.id) return toast('You cannot deactivate yourself', 'bad');
    db.put('users', { ...u, active: u.active === false });
    audit(user, u.active === false ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', 'user:' + u.id, { detail: u.email });
    toast(`${u.name} ${u.active === false ? 'activated' : 'deactivated'}`, 'good');
  };
  return (
    <Page title="Users" subtitle={isAdmin ? 'Everyone with access to APAAR-Setu and their role.' : 'People from your institution who can use APAAR-Setu.'} guide="users"
      actions={<button className="btn primary" onClick={() => setModal(true)}>+ Add user</button>}>
      <Table rows={rows} search="Search name or email…" searchKeys={['name', 'email', 'role']} columns={[
        { key: 'name', label: 'Name', render: (u) => <><b>{u.name}</b><div className="small muted">{u.title}</div></> },
        { key: 'email', label: 'Email', render: (u) => <span className="mono small">{u.email}</span> },
        { key: 'role', label: 'Role', render: (u) => <Badge color={ROLES[u.role].color}>{ROLES[u.role].label}</Badge> },
        { key: 'scope', label: 'Scope', render: (u) => u.institutionId ? db.get('institutions', u.institutionId)?.short : u.region ? REGIONS[u.region]?.name + ' region' : u.apaarId ? 'APAAR ' + u.apaarId : u.org || 'All India' },
        { key: 'active', label: 'Status', render: (u) => <Badge color={u.active === false ? 'grey' : 'green'}>{u.active === false ? 'Inactive' : 'Active'}</Badge> },
        { key: 'createdAt', label: 'Added', render: (u) => fmtDate(u.createdAt) },
        { key: 'act', label: '', nosort: true, render: (u) => u.id !== user.id && (isAdmin || u.role === 'data_clerk') && <button className="btn sm" onClick={() => toggle(u)}>{u.active === false ? 'Activate' : 'Deactivate'}</button> },
      ]} />
      {modal && <AddUser user={user} onClose={() => setModal(false)} />}
    </Page>
  );
}

function AddUser({ user, onClose }) {
  const isAdmin = user.role === 'aicte_admin';
  const roles = isAdmin ? Object.keys(ROLES) : ['data_clerk', 'institution_admin'];
  const [f, setF] = useState({ name: '', email: '', role: roles[0], password: 'Welcome@' + Math.floor(1000 + Math.random() * 9000), institutionId: user.institutionId || db.all('institutions')[0]?.id, region: 'WRO', apaarId: '', org: '', orgType: 'Employer', title: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr('');
    if (!f.name || !/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a name and a valid email.');
    if (db.find('users', (u) => u.email.toLowerCase() === f.email.toLowerCase())) return setErr('A user with this email already exists.');
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.');
    if (f.role === 'student' && !/^\d{12}$/.test(f.apaarId)) return setErr('Students need their 12-digit APAAR ID.');
    setBusy(true);
    try {
      const payload = { ...f, institutionId: ['institution_admin', 'data_clerk'].includes(f.role) ? (isAdmin ? f.institutionId : user.institutionId) : '', region: f.role === 'regional_officer' ? f.region : '', apaarId: f.role === 'student' ? f.apaarId : '', org: f.role === 'verifier' ? f.org : '', orgType: f.role === 'verifier' ? f.orgType : '' };
      await createUser(payload, user);
      toast(`User created. Share the temporary password: ${f.password}`, 'good');
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Add user" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Creating…' : 'Create user'}</button></>}>
      {err && <Callout kind="bad">{err}</Callout>}
      <div className="form-grid">
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Role" help={ROLES[f.role].desc}><select className="input" value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select></Field>
        {isAdmin && ['institution_admin', 'data_clerk'].includes(f.role) && <Field label="Institution"><select className="input" value={f.institutionId} onChange={set('institutionId')}>{db.all('institutions').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>}
        {f.role === 'regional_officer' && <Field label="Region"><select className="input" value={f.region} onChange={set('region')}>{Object.entries(REGIONS).map(([k, r]) => <option key={k} value={k}>{r.name} ({r.states.join(', ')})</option>)}</select></Field>}
        {f.role === 'student' && <Field label="APAAR ID" help="Links the account to the student's records"><input className="input mono" value={f.apaarId} onChange={set('apaarId')} maxLength={12} /></Field>}
        {f.role === 'verifier' && <><Field label="Organisation"><input className="input" value={f.org} onChange={set('org')} /></Field><Field label="Type"><select className="input" value={f.orgType} onChange={set('orgType')}><option>Employer</option><option>Regulator</option><option>University</option><option>Government</option></select></Field></>}
        <Field label="Job title"><input className="input" value={f.title} onChange={set('title')} /></Field>
        <Field label="Temporary password" help="Ask them to change it from Profile"><input className="input mono" value={f.password} onChange={set('password')} /></Field>
      </div>
    </Modal>
  );
}
