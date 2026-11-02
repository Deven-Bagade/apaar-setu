// Public pages (verify, transparency, help) use the app shell when signed in, a light header otherwise.
import { Link } from 'react-router-dom';
import { useSession } from '../data/session';
import { useLang, LANGS, setLang } from '../lib/i18n';
import Layout from './Layout';
import Chatbot from './Chatbot';
import { BrandMark, Stripes } from './ui';

export function PublicNav() {
  const { lang, t } = useLang();
  const { user } = useSession();
  return (
    <>
      <Stripes />
      <header className="lnav">
        <Link to="/" className="brand"><BrandMark /><span><b>APAAR-Setu</b><small>AICTE student data &amp; verification</small></span></Link>
        <nav>
          <Link to="/verify">{t('Verify a credential')}</Link>
          <Link to="/transparency">{t('Transparency')}</Link>
          <Link to="/help">{t('Help')}</Link>
          <select className="input" style={{ width: 'auto', padding: '4px 8px' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {user ? <Link className="btn sm sun" to="/app">Open dashboard →</Link> : <Link className="btn sm primary" to="/login">{t('Sign in')}</Link>}
        </nav>
      </header>
    </>
  );
}

export default function PublicFrame({ children }) {
  const { user } = useSession();
  if (user) return <Layout>{children}</Layout>;
  return (
    <div className="landing">
      <PublicNav />
      <div className="content" style={{ margin: '0 auto' }}>{children}</div>
      <Chatbot />
    </div>
  );
}
