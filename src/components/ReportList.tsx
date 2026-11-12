import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteReport, listReports } from '../api';
import { formatDate } from '../lib/format';
import { invalidateReports, nameMatch } from '../lib/health';
import type { ReportSummary } from '../types';
import { Empty, Icon, PageHeader, Spinner } from './ui';

type Filter = 'all' | 'flagged' | 'clear' | 'failed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flagged', label: 'Has flags' },
  { key: 'clear', label: 'All clear' },
  { key: 'failed', label: 'Not accepted' },
];

export default function ReportList({ onOpen, onScan, profileName }: { onOpen: (id: string) => void; onScan: () => void; profileName: string }) {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

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
      invalidateReports();
      setReports((list) => list?.filter((x) => x.reportId !== r.reportId) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, flagged: 0, clear: 0, failed: 0 };
    for (const r of reports ?? []) {
      c.all++;
      if (r.status === 'FAILED') c.failed++;
      else if ((r.abnormalCount ?? 0) > 0) c.flagged++;
      else c.clear++;
    }
    return c;
  }, [reports]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (reports ?? []).filter((r) => {
      const failed = r.status === 'FAILED';
      const flagged = !failed && (r.abnormalCount ?? 0) > 0;
      if (filter === 'failed' && !failed) return false;
      if (filter === 'flagged' && !flagged) return false;
      if (filter === 'clear' && (failed || flagged)) return false;
      if (!q) return true;
      return [r.labName, r.fileName, r.patientName, r.reportDate].some((v) => v?.toLowerCase().includes(q));
    });
  }, [reports, query, filter]);

  return (
    <div className="page">
      <PageHeader
        title="My reports"
        subtitle={reports ? `${reports.length} report${reports.length === 1 ? '' : 's'} stored in DynamoDB, files in your private S3 folder` : 'Loading from DynamoDB…'}
        actions={
          <>
            <button className="btn-ghost" onClick={load} disabled={refreshing}>
              <span className={refreshing ? 'spin' : ''}><Icon name="refresh" size={16} /></span> Refresh
            </button>
            <button className="btn-primary" onClick={onScan}><Icon name="scan" size={16} /> Scan a report</button>
          </>
        }
      />

      {error && <div className="alert error"><Icon name="alert" /> {error}</div>}

      {reports && reports.length > 0 && (
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by lab, patient, file or date" />
          </label>
          <div className="filter-chips" role="tablist">
            {FILTERS.map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                {f.label} <span className="num">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!reports ? (
        <div className="card center"><Spinner /></div>
      ) : reports.length === 0 ? (
        <Empty icon="file" title="No reports yet">Scan your first lab report to start building your history.</Empty>
      ) : shown.length === 0 ? (
        <Empty icon="search" title="Nothing matches">Try a different search or filter.</Empty>
      ) : (
        <div className="report-grid">
          {shown.map((r, i) => {
            const failed = r.status === 'FAILED';
            const abnormal = r.abnormalCount ?? 0;
            const other = !failed && nameMatch(profileName, r.patientName) === 'mismatch';
            return (
              <article
                key={r.reportId}
                className={`report-card ${failed ? 'failed' : abnormal ? 'flagged' : 'clear'}`}
                style={{ ['--i' as string]: i }}
                onClick={() => !failed && onOpen(r.reportId)}
                tabIndex={failed ? -1 : 0}
                onKeyDown={(e) => e.key === 'Enter' && !failed && onOpen(r.reportId)}
              >
                <div className="rc-top">
                  <span className="rc-date"><Icon name="calendar" size={14} /> {formatDate(r.reportDate)}</span>
                  <span className={`status ${failed ? 'failed' : abnormal ? 'flagged' : 'done'}`}>
                    {failed ? 'Not accepted' : abnormal ? `${abnormal} flagged` : 'All clear'}
                  </span>
                </div>
                <div className="rc-title">{r.labName || r.fileName}</div>
                <div className="rc-patient">
                  <Icon name="user" size={14} /> {r.patientName ?? 'Patient not found'}
                  {other && <span className="chip warn">different person</span>}
                </div>

                {failed ? (
                  <div className="rc-error">{r.errorMessage}</div>
                ) : (
                  <div className="rc-meter">
                    <span className="rc-meter-bar">
                      <span className="ok" style={{ flex: (r.testCount ?? 0) - abnormal }} />
                      <span className="bad" style={{ flex: abnormal }} />
                    </span>
                    <span className="small muted">
                      <strong className="num">{r.testCount ?? 0}</strong> tests · <strong className="num">{(r.testCount ?? 0) - abnormal}</strong> in range
                    </span>
                  </div>
                )}

                <div className="rc-foot">
                  <span className="chip">{r.mode === 'async' ? 'PDF · async job' : 'Image · sync call'}</span>
                  <span className="chip">{r.pages ?? 1} page{(r.pages ?? 1) > 1 ? 's' : ''}</span>
                  {r.demo && <span className="chip demo">Demo data</span>}
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
