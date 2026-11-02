// Floating assistant available on every page.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ask, suggestions } from '../services/assistant';
import { useSession } from '../data/session';
import { t } from '../lib/i18n';

export default function Chatbot() {
  const { user } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const body = useRef(null);

  useEffect(() => {
    setMsgs([{ from: 'bot', ...ask('hello', user) }]);
  }, [user?.id]);
  useEffect(() => {
    body.current?.scrollTo(0, body.current.scrollHeight);
  }, [msgs, open]);

  const send = (q) => {
    const question = (q ?? text).trim();
    if (!question) return;
    setText('');
    let reply;
    try {
      reply = ask(question, user);
    } catch (e) {
      reply = { text: 'Sorry, something went wrong while reading the data: ' + e.message };
    }
    setMsgs((m) => [...m, { from: 'me', text: question }, { from: 'bot', ...reply }]);
  };

  if (!open) {
    return (
      <button className="chat-fab no-print" onClick={() => setOpen(true)} aria-label="Open assistant">
        <span aria-hidden>💬</span><span className="fab-label">{t('Ask Setu Sahayak')}</span>
      </button>
    );
  }
  return (
    <div className="chat no-print" role="dialog" aria-label="Setu Sahayak assistant">
      <div className="chat-head">
        <div style={{ flex: 1 }}>
          <b>Setu Sahayak</b>
          <small>Answers about this website and the data you can see</small>
        </div>
        <button className="btn sm" onClick={() => setMsgs([{ from: 'bot', ...ask('hello', user) }])} title="Clear">↺</button>
        <button className="btn sm" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
      </div>
      <div className="chat-body" ref={body}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.from}`}>
            {m.text}
            {m.table && (
              <table>
                <thead><tr>{m.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{m.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
              </table>
            )}
            {m.to?.length > 0 && (
              <div className="links">
                {m.to.map(([label, path]) => (
                  <button key={path} className="btn sm sun" onClick={() => { nav(path); if (window.innerWidth < 820) setOpen(false); }}>{label} →</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chips">
        {(suggestions(user) || []).map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Type your question…')} aria-label="Question" autoFocus />
        <button className="btn primary" type="submit">{t('Send')}</button>
      </form>
    </div>
  );
}
