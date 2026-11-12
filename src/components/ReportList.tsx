import { useCallback, useEffect, useState } from 'react';
import { deleteReport, listReports } from '../api';
import { formatDate } from '../lib/format';
import type { ReportSummary } from '../types';
import { Icon, Spinner } from './ui';

export default function ReportList({ onOpen }: { onOpen: (id: string) => void }) {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const items = await listReports();
      // newest report date first (not upload time)
      setReports(items.sort((a, b) => (b.reportDate ?? '').localeCompare(a.reportDate ?? '')));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(r: ReportSummary) {
    if (!window.confirm(`Delete "${r.labName || r.fileName}"? This removes the file from S3 and the results from DynamoDB.`)) return;
    try {
      await deleteReport(r.reportId);
      setReports((list) => list?.filter((x) => x.reportId !== r.reportId) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>My reports</h1>
          <p className="muted">
            {reports ? `${reports.length} report${reports.length === 1 ? '' : 's'} stored in DynamoDB` : 'Loading from DynamoDB…'}
          </p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={refreshing}>
          <span className={refreshing ? 'spin' : ''}><Icon name="refresh" size={16} /></span> Refresh
        </button>
      </header>

      {error && <div className="alert error"><Icon name="alert" /> {error}</div>}

      {!reports ? (
        <div className="card center"><Spinner /></div>
      ) : reports.length === 0 ? (
        <div className="card empty">
          <Icon name="file" size={32} />
          <p>No reports yet. Upload one from the <strong>Upload</strong> tab.</p>
        </div>
      ) : (
        <div className="report-grid">
          {reports.map((r, i) => {
            const failed = r.status === 'FAILED';
            const abnormal = r.abnormalCount ?? 0;
            return (
              <article
                key={r.reportId}
                className={`report-card ${failed ? 'failed' : abnormal ? 'flagged' : ''}`}
                style={{ ['--i' as string]: i }}
                onClick={() => !failed && onOpen(r.reportId)}
                tabIndex={failed ? -1 : 0}
                onKeyDown={(e) => e.key === 'Enter' && !failed && onOpen(r.reportId)}
              >
                <div className="rc-top">
                  <span className="rc-date">{formatDate(r.reportDate)}</span>
                  <span className={`status ${failed ? 'failed' : 'done'}`}>{failed ? 'Failed' : 'Ready'}</span>
                </div>
                <div className="rc-title">{r.labName || r.fileName}</div>
                <div className="muted small">{r.patientName ?? '—'}</div>

                {failed ? (
                  <div className="rc-error">{r.errorMessage}</div>
                ) : (
                  <div className="rc-meter">
                    <span className="rc-meter-bar">
                      <span className="ok" style={{ flex: (r.testCount ?? 0) - abnormal }} />
                      <span className="bad" style={{ flex: abnormal }} />
                    </span>
                    <span className="small">
                      <strong className="num">{r.testCount ?? 0}</strong> tests ·{' '}
                      <strong className={`num ${abnormal ? 'bad-text' : 'good-text'}`}>{abnormal}</strong> out of range
                    </span>
                  </div>
                )}

                <div className="rc-foot">
                  <span className="chip">{r.mode === 'async' ? 'PDF · async' : 'Image · sync'}</span>
                  <span className="chip">{r.pages ?? 1} page{(r.pages ?? 1) > 1 ? 's' : ''}</span>
                  <button className="icon-btn danger" title="Delete report" aria-label="Delete report"
                    onClick={(e) => { e.stopPropagation(); remove(r); }}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
