import { useState } from 'react';
import { Page, Card, KV, Field, toast, Callout, Badge } from '../components/ui';
import { useSession, changePassword } from '../data/session';
import { db } from '../data/store';
import { ROLES, PERMS } from '../lib/constants';
import { scopeLabel } from '../data/scope';

export default function Profile() {
  const { user } = useSession();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords do not match.');
    try {
      await changePassword(pw);
      setPw('');
      setPw2('');
      toast('Password changed', 'good');
    } catch (x) {
      setErr(x.message);
    }
  };
  const perms = Object.entries(PERMS).filter(([, r]) => r.includes(user.role)).map(([p]) => p);
  return (
    <Page title="Profile" subtitle="Your account, role and what it allows.">
      <div className="grid g2">
        <Card title="Account">
          <KV items={[
            ['Name', user.name],
            ['Email', user.email],
            ['Role', <Badge color={ROLES[user.role].color} key="r">{ROLES[user.role].label}</Badge>],
            ['Scope', scopeLabel(user)],
            user.apaarId && ['APAAR ID', <span className="mono" key="a">{user.apaarId}</span>],
            user.institutionId && ['Institution', db.get('institutions', user.institutionId)?.name],
          ]} />
          <h3 className="mt">Your permissions</h3>
          <div className="row" style={{ gap: 4 }}>{perms.map((p) => <span key={p} className="badge grey mono">{p}</span>)}</div>
        </Card>
        <form className="card" onSubmit={save}>
          <h3>Change password</h3>
          {err && <Callout kind="bad">{err}</Callout>}
          <div className="col">
            <Field label="New password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <Field label="Repeat new password"><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
            <button className="btn primary">Change password</button>
          </div>
        </form>
      </div>
    </Page>
  );
}
