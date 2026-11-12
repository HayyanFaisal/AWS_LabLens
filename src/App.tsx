import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { clearSession, getAccount, loadSession, setUnauthorizedHandler, type Session } from './api';
import AuthScreen from './components/AuthScreen';
import Dashboard, { type Page } from './components/Dashboard';
import Onboarding from './components/Onboarding';
import ProfilePage from './components/ProfilePage';
import ReportDetail from './components/ReportDetail';
import ReportList from './components/ReportList';
import UploadPanel from './components/UploadPanel';
import { Icon, Logo, Spinner } from './components/ui';
import { invalidateReports } from './lib/health';
import type { Account, Profile } from './types';

// The chart library is large, so it only loads when Trends is opened
const Trends = lazy(() => import('./components/Trends'));

const NAV: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home' },
  { key: 'scan', label: 'Scan report', icon: 'scan' },
  { key: 'reports', label: 'My reports', icon: 'file' },
  { key: 'trends', label: 'Health trends', icon: 'chart' },
  { key: 'profile', label: 'Health profile', icon: 'user' },
];

const SERVICES = ['Amplify Hosting', 'Lambda API', 'Amazon Textract', 'Amazon S3', 'DynamoDB'];

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [trendKey, setTrendKey] = useState<string | null>(null);

  const signOut = useCallback(() => {
    clearSession();
    invalidateReports();
    setSession(null);
    setAccount(null);
    setPage('dashboard');
    setOpenReportId(null);
  }, []);

  // Any 401 from the API (expired or invalid token) signs the user out
  useEffect(() => setUnauthorizedHandler(signOut), [signOut]);

  // After sign-in, load the user's profile (GET /profile)
  useEffect(() => {
    if (!session) return;
    setAccountError(null);
    getAccount().then(setAccount).catch((e) => setAccountError(e instanceof Error ? e.message : String(e)));
  }, [session]);

  if (!session) return <AuthScreen onSignedIn={(s) => { invalidateReports(); setSession(s); }} />;

  if (!account) {
    return (
      <div className="splash">
        <Logo size={44} />
        {accountError ? (
          <>
            <p className="bad-text">{accountError}</p>
            <button className="btn-ghost" onClick={signOut}>Back to sign in</button>
          </>
        ) : <Spinner />}
      </div>
    );
  }

  const setProfile = (profile: Profile) => setAccount({ ...account, profile });

  if (!account.profile) {
    return <Onboarding username={account.username} onDone={setProfile} onSignOut={signOut} />;
  }

  const profile = account.profile;
  const go = (p: Page) => {
    setPage(p);
    setOpenReportId(null);
    window.scrollTo({ top: 0 });
  };
  const openReport = (id: string) => {
    setPage('reports');
    setOpenReportId(id);
    window.scrollTo({ top: 0 });
  };
  const openTest = (key: string) => {
    setTrendKey(key);
    go('trends');
  };
  const initials = profile.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /><span className="brand-name">LabLens</span></div>

        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.key} className={page === n.key ? 'nav-item on' : 'nav-item'} onClick={() => go(n.key)} aria-current={page === n.key ? 'page' : undefined}>
              <Icon name={n.icon} size={19} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="side-services">
          <div className="ss-title">Running on AWS</div>
          {SERVICES.map((s) => <div key={s} className="ss-item"><span className="ss-dot" />{s}</div>)}
          <div className="ss-region">us-east-1</div>
        </div>

        <div className="side-user">
          <span className="avatar">{initials}</span>
          <span className="su-text">
            <strong>{profile.fullName}</strong>
            <small>@{account.username}</small>
          </span>
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out"><Icon name="logout" size={17} /></button>
        </div>
      </aside>

      <div className="main">
        <main className="content" key={`${page}-${openReportId ?? ''}`}>
          {page === 'dashboard' && <Dashboard profile={profile} onNavigate={go} onOpenReport={openReport} onOpenTest={openTest} />}
          {page === 'scan' && <UploadPanel onOpen={openReport} profileName={profile.fullName} />}
          {page === 'reports' &&
            (openReportId ? (
              <ReportDetail reportId={openReportId} onBack={() => setOpenReportId(null)} profile={profile} />
            ) : (
              <ReportList onOpen={openReport} onScan={() => go('scan')} profileName={profile.fullName} />
            ))}
          {page === 'trends' && (
            <Suspense fallback={<div className="page"><div className="card center"><Spinner /></div></div>}>
              <Trends initialKey={trendKey} />
            </Suspense>
          )}
          {page === 'profile' && <ProfilePage username={account.username} createdAt={account.createdAt} profile={profile} onSaved={setProfile} />}
        </main>

        <footer className="foot">
          Built with AWS Amplify + Amazon Textract · Hayyan Faisal &amp; Ali Sajjad · Demo only, not medical advice
        </footer>
      </div>
    </div>
  );
}
