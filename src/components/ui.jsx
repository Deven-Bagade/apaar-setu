// Shared UI building blocks. Every page uses these so the look stays consistent.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { t } from '../lib/i18n';
import { GUIDES } from '../lib/guides';
import { getLang } from '../lib/i18n';

export function Page({ kicker, title, subtitle, actions, guide, children }) {
  useEffect(() => {
    document.title = `${title} · APAAR-Setu`;
  }, [title]);
  return (
    <div>
      <div className="page-head">
        <div className="titles">
          {kicker && <div className="kicker">{kicker}</div>}
          <h1>{t(title)}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {guide && <Guide id={guide} />}
      {children}
    </div>
  );
}

export function Guide({ id }) {
  const g = GUIDES[id];
  const key = 'apaar-setu-guide-' + id;
  const [open, setOpen] = useState(() => localStorage.getItem(key) !== 'closed');
  if (!g) return null;
  const steps = (getLang() !== 'en' && g[getLang()]) || g.en;
  return (
    <details className="guide" open={open} onToggle={(e) => {
      setOpen(e.target.open);
      localStorage.setItem(key, e.target.open ? 'open' : 'closed');
    }}>
      <summary><span className="q">?</span>{t('How to use this page')}<span className="chev">{open ? t('Hide') : t('Show')}</span></summary>
      <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </details>
  );
}

export const Card = ({ title, sub, actions, accent, className = '', children, tight }) => (
  <div className={`card ${accent ? 'accent-' + accent : ''} ${tight ? 'tight' : ''} ${className}`}>
    {(title || actions) && (
      <div className="card-head">
        <div style={{ flex: 1 }}>
          {title && <h3>{title}</h3>}
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions}
      </div>
    )}
    {children}
  </div>
);

export const Stat = ({ label, value, hint, color = 'yellow', onClick }) => (
  <div className={`stat ${color}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
    <div className="lbl">{label}</div>
    <div className="val">{value}</div>
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Badge = ({ color = 'grey', children, title }) => <span className={`badge ${color}`} title={title}>{children}</span>;

export const Bar = ({ value, max = 100, color, label, thick }) => {
  const p = max ? Math.min(100, (value / max) * 100) : 0;
  const c = color || (p > 100 ? 'var(--red)' : 'var(--green)');
  return (
    <div className={`bar ${thick ? 'thick' : ''}`} title={label}>
      <i style={{ width: p + '%', '--c': c }} />
      {label && <span className="lbl">{label}</span>}
    </div>
  );
};

export const Callout = ({ kind = 'info', title, children }) => (
  <div className={`callout ${kind}`}>
    {title && <b>{title}</b>}
    {children}
  </div>
);

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn sm" onClick={onClose}>{t('Close')} ✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export const Field = ({ label, help, error, children }) => (
  <div className="field">
    {label && <label>{label}</label>}
    {children}
    {error ? <div className="err">{error}</div> : help ? <div className="help">{help}</div> : null}
  </div>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export const KV = ({ items }) => (
  <dl className="kv">
    {items.filter(Boolean).map(([k, v]) => [<dt key={k + 't'}>{k}</dt>, <dd key={k + 'd'}>{v === undefined || v === null || v === '' ? '—' : v}</dd>])}
  </dl>
);

/**
 * Data table with search, paging and row click.
 * columns: [{ key, label, render?(row), num?, width?, sort?(row) }]
 */
export function Table({ columns, rows, onRowClick, pageSize = 15, empty = 'Nothing to show.', search, searchKeys, toolbar, rowClass, initialSort }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(initialSort || null);
  const filtered = useMemo(() => {
    let r = rows;
    if (q && searchKeys) {
      const s = q.toLowerCase();
      r = r.filter((x) => searchKeys.some((k) => String(typeof k === 'function' ? k(x) : x[k] ?? '').toLowerCase().includes(s)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = col?.sort || ((x) => x[sort.key]);
      r = [...r].sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''));
        return sort.dir === 'asc' ? c : -c;
      });
    }
    return r;
  }, [rows, q, sort, searchKeys, columns]);
  useEffect(() => setPage(0), [q, rows.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <div>
      {(search || toolbar) && (
        <div className="toolbar">
          {search && <input className="input grow" placeholder={search} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />}
          {toolbar}
        </div>
      )}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} style={{ width: c.width, cursor: c.nosort ? 'default' : 'pointer' }}
                  onClick={() => !c.nosort && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={columns.length}><div className="muted center" style={{ padding: 16 }}>{empty}</div></td></tr>
            )}
            {view.map((r, i) => (
              <tr key={r.id || i} className={`${onRowClick ? 'click' : ''} ${rowClass ? rowClass(r) : ''}`} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > pageSize && (
          <div className="pager">
            <span>{page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
            <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button>
            <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next ›</button>
          </div>
        )}
        {filtered.length <= pageSize && filtered.length > 0 && <div className="pager"><span>{filtered.length} row{filtered.length === 1 ? '' : 's'}</span></div>}
      </div>
    </div>
  );
}

// ---- Toasts ----
let toasts = [];
const tsubs = new Set();
let tv = 0;
export function toast(text, kind = '') {
  const id = Math.random();
  toasts = [...toasts, { id, text, kind }];
  tv++;
  tsubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    tv++;
    tsubs.forEach((f) => f());
  }, 4200);
}
export function Toasts() {
  useSyncExternalStore((f) => (tsubs.add(f), () => tsubs.delete(f)), () => tv);
  return <div className="toasts" aria-live="polite">{toasts.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.text}</div>)}</div>;
}

export const Stripes = () => <div className="stripes"><span /><span /><span /><span /></div>;
export const BrandMark = () => <span className="brand-mark"><i /><i /><i /><i /></span>;

export function Confirm({ title, body, confirmLabel = 'Confirm', kind = 'primary', onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className={`btn ${kind}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
      {body}
    </Modal>
  );
}
