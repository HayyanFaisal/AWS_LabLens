import { useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import UploadPanel from './components/UploadPanel';
import ReportList from './components/ReportList';
import ReportDetail from './components/ReportDetail';
import Trends from './components/Trends';

type Tab = 'upload' | 'reports' | 'trends';

export default function App() {
  const [tab, setTab] = useState<Tab>('upload');
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  const openReport = (id: string) => {
    setOpenReportId(id);
    setTab('reports');
  };

  return (
    <Authenticator signUpAttributes={['email']}>
      {({ signOut, user }) => (
        <div className="app">
          <header className="topbar">
            <div className="brand">
              <span className="logo">◉</span> LabLens
              <span className="tagline">Lab report digitizer</span>
            </div>
            <nav className="tabs">
              {(['upload', 'reports', 'trends'] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={tab === t ? 'tab active' : 'tab'}
                  onClick={() => {
                    setTab(t);
                    if (t !== 'reports') setOpenReportId(null);
                  }}
                >
                  {t === 'upload' ? 'Upload' : t === 'reports' ? 'My reports' : 'Health trends'}
                </button>
              ))}
            </nav>
            <div className="user">
              <span>{user?.signInDetails?.loginId}</span>
              <button className="ghost" onClick={signOut}>Sign out</button>
            </div>
          </header>

          <main className="content">
            {tab === 'upload' && <UploadPanel onDone={openReport} />}
            {tab === 'reports' &&
              (openReportId ? (
                <ReportDetail reportId={openReportId} onBack={() => setOpenReportId(null)} />
              ) : (
                <ReportList onOpen={setOpenReportId} />
              ))}
            {tab === 'trends' && <Trends />}
          </main>

          <footer className="foot">
            Built with AWS Amplify + Amazon Textract · For demonstration only, not medical advice
          </footer>
        </div>
      )}
    </Authenticator>
  );
}
