import { lazy, Suspense, useEffect, useState } from 'react';
import { clearSession, loadSession, me, setUnauthorizedHandler, type Session } from './api';
import AuthScreen from './components/AuthScreen';
import ReportDetail from './components/ReportDetail';
import ReportList from './components/ReportList';
import UploadPanel from './components/UploadPanel';
import { Icon, Logo, Spinner } from './components/ui';

// The chart library is large, so it only loads when Trends is opened
const Trends = lazy(() => import('./components/Trends'));

type Tab = 'upload' | 'reports' | 'trends';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'upload', label: 'Upload', icon: 'upload' },
  { key: 'reports', label: 'My reports', icon: 'file' },
  { key: 'trends', label: 'Health trends', icon: 'chart' },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [tab, setTab] = useState<Tab>('upload');
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  // Any 401 from the API (expired or invalid token) signs the user out
  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    if (session) me().catch(() => undefined); // checks a stored token is still valid
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = () => {
    clearSession();
    setSession(null);
    setTab('upload');
    setOpenReportId(null);
  };

  if (!session) return <AuthScreen onSignedIn={setSession} />;

  const go = (t: Tab) => {
    setTab(t);
    setOpenReportId(null);
  };
  const tabIndex = TABS.findIndex((t) => t.key === tab);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Logo />
            <span className="brand-name">LabLens</span>
          </div>
          <nav className="tabs" aria-label="Sections">
            <span className="tab-pill" style={{ transform: `translateX(${tabIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'tab on' : 'tab'} onClick={() => go(t.key)} aria-current={tab === t.key}>
                <Icon name={t.icon} size={16} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="user">
            <span className="avatar" aria-hidden="true">{session.username.slice(0, 1).toUpperCase()}</span>
            <span className="user-name">{session.username}</span>
            <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="content" key={`${tab}-${openReportId ?? ''}`}>
        {tab === 'upload' && (
          <UploadPanel onOpen={(id) => { setTab('reports'); setOpenReportId(id); }} />
        )}
        {tab === 'reports' &&
          (openReportId ? (
            <ReportDetail reportId={openReportId} onBack={() => setOpenReportId(null)} />
          ) : (
            <ReportList onOpen={setOpenReportId} />
          ))}
        {tab === 'trends' && (
          <Suspense fallback={<div className="card center"><Spinner /></div>}>
            <Trends />
          </Suspense>
        )}
      </main>

      <footer className="foot">
        Built with AWS Amplify + Amazon Textract · Hayyan Faisal &amp; Ali Sajjad · Demo only, not medical advice
      </footer>
    </div>
  );
}
