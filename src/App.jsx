import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { boot, useSession } from './data/session';
import { useStore } from './data/store';
import { Toasts } from './components/ui';
import Layout from './components/Layout';
import PublicFrame from './components/PublicFrame';
import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import VerifyPage from './pages/public/Verify';
import Transparency from './pages/public/Transparency';
import Help from './pages/public/Help';
import Setup from './pages/public/Setup';
import Dashboard from './pages/Dashboard';
import Institutions, { InstitutionDetail } from './pages/Institutions';
import Ledger from './pages/Ledger';
import Students, { StudentDetail } from './pages/Students';
import Upload from './pages/Upload';
import Batches, { BatchDetail } from './pages/Batches';
import Radar from './pages/Radar';
import Flags from './pages/Flags';
import Inspection from './pages/Inspection';
import Trust from './pages/Trust';
import Scholarships from './pages/Scholarships';
import Lifecycle from './pages/Lifecycle';
import Reports from './pages/Reports';
import Certificates from './pages/Certificates';
import Audit from './pages/Audit';
import Users from './pages/Users';
import Rules from './pages/Rules';
import ApiSandbox from './pages/ApiSandbox';
import Inbox from './pages/Inbox';
import Profile from './pages/Profile';
import Me from './pages/student/Me';
import Credentials from './pages/student/Credentials';
import ConsentPage from './pages/student/Consent';
import AccessLog from './pages/student/AccessLog';
import Requests from './pages/verifier/Requests';

const STAFF = ['aicte_admin', 'regional_officer'];
const INST = ['institution_admin', 'data_clerk'];

function Guard({ roles, children }) {
  const { user } = useSession();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.hash }} replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card accent-red" style={{ maxWidth: 560 }}>
        <h2>Not available for your role</h2>
        <p>This page is for {roles.map((r) => r.replace('_', ' ')).join(', ')}. Your access is limited by role-based access control.</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  useStore();
  const { status, error } = useSession();
  useEffect(() => {
    boot();
  }, []);
  if (status === 'loading') return <div className="loading">Loading APAAR-Setu…</div>;
  if (status === 'error') return <div className="loading"><div className="card accent-red" style={{ maxWidth: 560 }}><h2>Could not start</h2><p>{error}</p></div></div>;
  if (status === 'setup') return <Setup />;
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<PublicFrame><VerifyPage /></PublicFrame>} />
        <Route path="/transparency" element={<PublicFrame><Transparency /></PublicFrame>} />
        <Route path="/help" element={<PublicFrame><Help /></PublicFrame>} />
        <Route path="/app" element={<Guard><Layout /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="institutions" element={<Guard roles={STAFF}><Institutions /></Guard>} />
          <Route path="institutions/:id" element={<Guard roles={STAFF}><InstitutionDetail /></Guard>} />
          <Route path="ledger" element={<Guard roles={[...STAFF, ...INST]}><Ledger /></Guard>} />
          <Route path="students" element={<Guard roles={[...STAFF, ...INST]}><Students /></Guard>} />
          <Route path="students/:id" element={<Guard roles={[...STAFF, ...INST]}><StudentDetail /></Guard>} />
          <Route path="upload" element={<Guard roles={INST}><Upload /></Guard>} />
          <Route path="batches" element={<Guard roles={[...STAFF, ...INST]}><Batches /></Guard>} />
          <Route path="batches/:id" element={<Guard roles={[...STAFF, ...INST]}><BatchDetail /></Guard>} />
          <Route path="radar" element={<Guard roles={STAFF}><Radar /></Guard>} />
          <Route path="flags" element={<Guard roles={[...STAFF, 'institution_admin']}><Flags /></Guard>} />
          <Route path="inspection" element={<Guard roles={STAFF}><Inspection /></Guard>} />
          <Route path="trust" element={<Guard roles={INST}><Trust /></Guard>} />
          <Route path="scholarships" element={<Guard roles={STAFF}><Scholarships /></Guard>} />
          <Route path="lifecycle" element={<Guard roles={[...STAFF, 'institution_admin']}><Lifecycle /></Guard>} />
          <Route path="reports" element={<Guard roles={[...STAFF, 'institution_admin']}><Reports /></Guard>} />
          <Route path="certificates" element={<Guard roles={['institution_admin']}><Certificates /></Guard>} />
          <Route path="audit" element={<Guard roles={['aicte_admin']}><Audit /></Guard>} />
          <Route path="users" element={<Guard roles={['aicte_admin', 'institution_admin']}><Users /></Guard>} />
          <Route path="rules" element={<Guard roles={['aicte_admin']}><Rules /></Guard>} />
          <Route path="api" element={<Guard roles={['aicte_admin', 'institution_admin', 'data_clerk', 'verifier']}><ApiSandbox /></Guard>} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="profile" element={<Profile />} />
          <Route path="me" element={<Guard roles={['student']}><Me /></Guard>} />
          <Route path="credentials" element={<Guard roles={['student']}><Credentials /></Guard>} />
          <Route path="consent" element={<Guard roles={['student']}><ConsentPage /></Guard>} />
          <Route path="access" element={<Guard roles={['student']}><AccessLog /></Guard>} />
          <Route path="requests" element={<Guard roles={['verifier']}><Requests /></Guard>} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
