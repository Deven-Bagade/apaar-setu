// Report builders. Every report returns { title, sheets: [{ name, rows }] } and can be exported
// to Excel / CSV or printed. Accreditation formats follow the NBA SAR, NAAC and NIRF field names.
import * as XLSX from 'xlsx';
import { db } from '../data/store';
import { CATEGORIES, REGIONS } from '../lib/constants';
import { instMetrics } from './analytics';
import { computeTrust } from './trust';
import { capacity } from './ledger';
import { downloadFile, toCSV } from '../lib/util';

export const REPORTS = {
  compliance: { title: 'AICTE admission compliance report', for: ['aicte_admin', 'regional_officer'], desc: 'Per institution: intake, verified enrolment, supernumerary use, open flags and trust score.' },
  state: { title: 'State-wise enrolment summary', for: ['aicte_admin', 'regional_officer'], desc: 'Totals by state with fill rate and verification rate.' },
  category: { title: 'Category report (NRI / OCI / FN / supernumerary)', for: ['aicte_admin', 'regional_officer', 'institution_admin'], desc: 'Seats used against caps for every category pool.' },
  flags: { title: 'Anomaly and flag register', for: ['aicte_admin', 'regional_officer', 'institution_admin'], desc: 'All flags with reason, status and resolution.' },
  nba: { title: 'NBA SAR — student intake table', for: ['institution_admin', 'aicte_admin'], desc: 'N (sanctioned), N1 (1st year), N2 (lateral), N3 (supernumerary) per programme.' },
  naac: { title: 'NAAC — 2.1.1 Enrolment percentage', for: ['institution_admin', 'aicte_admin'], desc: 'Students admitted vs sanctioned seats per programme.' },
  nirf: { title: 'NIRF — sanctioned intake and student strength', for: ['institution_admin', 'aicte_admin'], desc: 'Sanctioned intake, total strength, gender split, within-state / outside-state / outside-country.' },
};

export function buildReport(type, scopeInsts) {
  const rules = db.rules();
  const insts = scopeInsts;
  const ms = insts.map((i) => instMetrics(i, rules));
  if (type === 'compliance') {
    return {
      sheets: [{
        name: 'Compliance',
        rows: ms.map((m) => {
          const t = computeTrust(m.inst, rules);
          return {
            'AICTE ID': m.inst.aicteId, Institution: m.inst.name, State: m.inst.state, 'Approved intake': m.intake,
            'Within-intake enrolled': m.within, 'Fill %': m.fillPct, Supernumerary: m.supern, 'Supernumerary cap': m.supernCap,
            'AICTE-verified': m.verified, 'Declared (approval portal)': m.declared ?? '', 'Open flags': m.flags.length,
            'Trust score': t.score, 'Trust band': t.band.label,
          };
        }),
      }],
    };
  }
  if (type === 'state') {
    const by = {};
    ms.forEach((m) => {
      const s = (by[m.inst.state] = by[m.inst.state] || { State: m.inst.state, Region: Object.values(REGIONS).find((r) => r.states.includes(m.inst.state))?.name, Institutions: 0, 'Approved intake': 0, Enrolled: 0, 'AICTE-verified': 0, 'Open flags': 0 });
      s.Institutions++;
      s['Approved intake'] += m.intake;
      s.Enrolled += m.active.length;
      s['AICTE-verified'] += m.verified;
      s['Open flags'] += m.flags.length;
    });
    return { sheets: [{ name: 'States', rows: Object.values(by).map((s) => ({ ...s, 'Fill %': s['Approved intake'] ? Math.round((s.Enrolled / s['Approved intake']) * 1000) / 10 : 0 })) }] };
  }
  if (type === 'category') {
    const rows = [];
    ms.forEach((m) => m.progs.forEach((p) => {
      const cap = capacity(p, rules);
      const act = m.active.filter((e) => e.programmeId === p.id);
      const row = { Institution: m.inst.name, Programme: p.course, Intake: p.approvedIntake };
      Object.keys(CATEGORIES).forEach((c) => (row[c] = act.filter((e) => e.category === c).length));
      row['NRI cap'] = cap.nriCap;
      row['TFW cap'] = cap.T;
      row['FN/OCI pool cap'] = cap.F;
      row['PMSSS cap'] = cap.P;
      row['Lateral cap'] = cap.L;
      rows.push(row);
    }));
    return { sheets: [{ name: 'Categories', rows }] };
  }
  if (type === 'flags') {
    const ids = new Set(insts.map((i) => i.id));
    const rows = db.where('flags', (f) => (f.refs?.institutionIds || [f.institutionId]).some((x) => ids.has(x))).map((f) => ({
      Code: f.code, Severity: f.severity, Title: f.title, Institution: db.get('institutions', f.institutionId)?.name, State: f.state, Status: f.status, Reason: f.reason, Resolution: f.resolution || '', Raised: f.createdAt.slice(0, 10),
    }));
    return { sheets: [{ name: 'Flags', rows }] };
  }
  if (type === 'nba') {
    const rows = [];
    ms.forEach((m) => m.progs.forEach((p) => {
      const act = m.active.filter((e) => e.programmeId === p.id);
      rows.push({
        Institution: m.inst.name, Programme: p.course, 'Academic year': `${rules.academicYear}-${String(rules.academicYear + 1).slice(2)}`,
        'Sanctioned intake (N)': p.approvedIntake,
        'Total admitted in 1st year (N1)': act.filter((e) => e.category !== 'LAT').length,
        'Admitted via lateral entry (N2)': act.filter((e) => e.category === 'LAT').length,
        'Separate division / supernumerary (N3)': act.filter((e) => e.group !== 'W' && e.category !== 'LAT').length,
        'Enrolment ratio N1/N %': p.approvedIntake ? Math.round((act.filter((e) => e.group === 'W').length / p.approvedIntake) * 1000) / 10 : 0,
      });
    }));
    return { sheets: [{ name: 'NBA intake', rows }] };
  }
  if (type === 'naac') {
    const rows = [];
    ms.forEach((m) => m.progs.forEach((p) => {
      const admitted = m.active.filter((e) => e.programmeId === p.id).length;
      rows.push({ Institution: m.inst.name, 'Programme name': p.course, 'Programme code': p.code, 'Number of seats sanctioned': p.approvedIntake, 'Number of students admitted': admitted, 'Enrolment %': p.approvedIntake ? Math.round((admitted / p.approvedIntake) * 1000) / 10 : 0 });
    }));
    return { sheets: [{ name: 'NAAC 2.1.1', rows }] };
  }
  if (type === 'nirf') {
    const rows = [];
    ms.forEach((m) => m.progs.forEach((p) => {
      const act = m.active.filter((e) => e.programmeId === p.id);
      const outsideCountry = act.filter((e) => e.nationality !== 'Indian').length;
      rows.push({
        Institution: m.inst.name, Programme: p.course, 'Sanctioned (approved) intake': p.approvedIntake, 'Total actual student strength': act.length,
        'No. of male students': act.filter((e) => e.gender === 'M').length, 'No. of female students': act.filter((e) => e.gender === 'F').length,
        'Within state (approx.)': act.length - outsideCountry - (act.filter((e) => e.category === 'PMSSS').length),
        'Outside state (PMSSS, approx.)': act.filter((e) => e.category === 'PMSSS').length,
        'Outside country': outsideCountry,
        'Fee waiver (TFW)': act.filter((e) => e.category === 'TFW').length,
      });
    }));
    return { sheets: [{ name: 'NIRF', rows, note: 'Within/outside state is approximated: home state is not collected in this demo.' }] };
  }
  return { sheets: [] };
}

export function exportXlsx(fileName, report) {
  const wb = XLSX.utils.book_new();
  report.sheets.forEach((s) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Note: 'No data' }]), s.name.slice(0, 30)));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadFile(fileName, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
export const exportCsv = (fileName, rows) => downloadFile(fileName, toCSV(rows), 'text/csv');
