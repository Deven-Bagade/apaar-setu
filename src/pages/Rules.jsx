import { useState } from 'react';
import { Page, Card, Field, toast, Callout } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { DEFAULT_RULES } from '../lib/constants';
import { audit } from '../services/audit';

const GROUPS = [
  ['Seat caps (Seat Ledger)', [
    ['nriSubCapPct', 'NRI sub-cap, % of intake', 'NRI seats come out of approved intake'],
    ['tfwPct', 'Tuition Fee Waiver, % of intake', 'Supernumerary'],
    ['fnPoolPct', 'FN / OCI / PIO / CIWGC pool, % of intake', 'Supernumerary'],
    ['pmsssAbs', 'PMSSS seats per programme', 'Supernumerary, fixed number'],
    ['lateralPct', 'Lateral entry, % of intake', 'UG and Diploma only'],
  ]],
  ['Validation and Radar thresholds', [
    ['nameMatchMin', 'Minimum ABC name match (0–1)', 'Below this, V02 rejects the row'],
    ['fuzzyDupMin', 'Look-alike identity threshold (0–1)', 'V11'],
    ['sharedContactMax', 'Max students per phone / bank account', 'Above this, V06'],
    ['yoyJumpPct', 'Year-on-year jump that raises V07, %', ''],
    ['declaredGapPct', 'Declared vs verified gap that raises V13, %', ''],
    ['outlierScoreMin', 'Isolation Forest score that raises V14', '0.5 = normal, 1 = extreme'],
  ]],
  ['Privacy', [
    ['smallCellSuppress', 'Suppress public counts below', 'Shown as “<n” on Transparency'],
    ['academicYear', 'Current academic year', ''],
  ]],
];

export default function Rules() {
  useStore();
  const { user } = useSession();
  const cur = db.rules();
  const [f, setF] = useState(cur);
  const changed = Object.keys(f).filter((k) => String(f[k]) !== String(cur[k]));
  const save = () => {
    const next = { ...cur };
    changed.forEach((k) => (next[k] = Array.isArray(DEFAULT_RULES[k]) ? f[k] : Number(f[k])));
    db.put('settings', { id: 'rules', ...next });
    audit(user, 'RULES_CHANGE', 'settings:rules', { before: cur, after: next, detail: changed.map((k) => `${k}: ${cur[k]} → ${next[k]}`).join('; ') });
    toast(`${changed.length} rule(s) saved and audited`, 'good');
  };
  return (
    <Page title="Rules & settings" subtitle="The numbers that drive the Seat Ledger and the Radar. Every change is written to the audit trail with before and after values." guide="rules"
      actions={<><button className="btn" onClick={() => setF({ ...DEFAULT_RULES })}>Reset to defaults</button><button className="btn primary" disabled={!changed.length} onClick={save}>Save {changed.length || ''} change(s)</button></>}>
      <Callout kind="warn">Defaults are configurable starting points. Confirm each cap against the current AICTE Approval Process Handbook before relying on it.</Callout>
      <div className="grid g3">
        {GROUPS.map(([title, fields]) => (
          <Card key={title} title={title}>
            <div className="col">
              {fields.map(([k, label, help]) => (
                <Field key={k} label={label} help={help}>
                  <input className={`input ${changed.includes(k) ? 'bad' : ''}`} type="number" step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
