import { useEffect, useState } from 'react';
import { remove } from 'aws-amplify/storage';
import { client, formatDate, reportDateOf, type Report } from '../client';

export default function ReportList({ onOpen }: { onOpen: (id: string) => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  // observeQuery = live subscription: new uploads and status changes appear
  // instantly, even from another browser tab or device (AppSync real-time).
  useEffect(() => {
    const sub = client.models.Report.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setReports(
          [...items].sort((a, b) => reportDateOf(b).localeCompare(reportDateOf(a))),
        );
        if (isSynced) setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  async function deleteReport(r: Report) {
    if (!confirmDelete(r)) return;
    const { data: results } = await client.models.TestResult.list({
      filter: { reportId: { eq: r.id } },
      limit: 1000,
    });
    await Promise.all(results.map((t) => client.models.TestResult.delete({ id: t.id })));
    await remove({ path: r.fileKey }).catch(() => undefined);
    await client.models.Report.delete({ id: r.id });
  }

  if (loading) return <section className="panel">Loading reports…</section>;

  return (
    <section className="panel">
      <h1>My reports</h1>
      {reports.length === 0 ? (
        <p className="muted">No reports yet. Upload one from the Upload tab.</p>
      ) : (
        <div className="report-grid">
          {reports.map((r) => (
            <article key={r.id} className="report-card" onClick={() => r.status === 'DONE' && onOpen(r.id)}>
              <div className="report-top">
                <span className={`status ${r.status?.toLowerCase()}`}>
                  {r.status === 'PROCESSING' ? 'Processing…' : r.status === 'FAILED' ? 'Failed' : 'Ready'}
                </span>
                <span className="muted small">{formatDate(reportDateOf(r))}</span>
              </div>
              <div className="report-title">{r.labName || r.fileName}</div>
              <div className="muted small">{r.patientName ?? '—'}</div>
              {r.status === 'DONE' && (
                <div className="report-meta">
                  <span>{r.testCount ?? 0} tests</span>
                  <span className={r.abnormalCount ? 'bad-text' : 'good-text'}>
                    {r.abnormalCount ?? 0} out of range
                  </span>
                  <span className="muted">{r.pages ?? 1} page{(r.pages ?? 1) > 1 ? 's' : ''}</span>
                </div>
              )}
              {r.status === 'FAILED' && <div className="bad-text small">{r.errorMessage}</div>}
              <button
                className="link danger"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteReport(r);
                }}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function confirmDelete(r: Report) {
  return window.confirm(`Delete "${r.labName || r.fileName}" and its results?`);
}
