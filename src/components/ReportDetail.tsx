import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { client, formatDate, reportDateOf, type Report, type TestResult } from '../client';

const LOW_CONFIDENCE = 90;

export default function ReportDetail({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: r } = await client.models.Report.get({ id: reportId });
      setReport(r);
      const { data: rows } = await client.models.TestResult.list({
        filter: { reportId: { eq: reportId } },
        limit: 1000,
      });
      setResults([...rows].sort((a, b) => (a.page ?? 0) - (b.page ?? 0)));
      if (r?.fileKey) {
        // Pre-signed URL: temporary link to the private S3 object
        const { url } = await getUrl({ path: r.fileKey, options: { expiresIn: 900 } });
        setFileUrl(url.toString());
      }
    })();
  }, [reportId]);

  if (!report) return <section className="panel">Loading…</section>;

  const shown = onlyAbnormal ? results.filter((t) => t.flag === 'LOW' || t.flag === 'HIGH') : results;
  const isPdf = /\.pdf$/i.test(report.fileKey);

  return (
    <section className="panel">
      <button className="link" onClick={onBack}>← All reports</button>
      <div className="detail-head">
        <div>
          <h1>{report.labName || report.fileName}</h1>
          <div className="muted">
            {report.patientName ?? 'Unknown patient'} · {formatDate(reportDateOf(report))} ·{' '}
            {report.pages ?? 1} page(s) · Textract {report.mode}
          </div>
        </div>
        <div className="stats small-stats">
          <div className="stat"><div className="stat-value">{results.length}</div><div className="stat-label">tests</div></div>
          <div className={`stat ${report.abnormalCount ? 'bad' : 'good'}`}>
            <div className="stat-value">{report.abnormalCount ?? 0}</div>
            <div className="stat-label">out of range</div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="detail-table">
          <label className="toggle">
            <input type="checkbox" checked={onlyAbnormal} onChange={(e) => setOnlyAbnormal(e.target.checked)} />
            Show only out-of-range results
          </label>
          <table className="grid">
            <thead>
              <tr>
                <th>Test</th>
                <th>Result</th>
                <th>Unit</th>
                <th>Reference range</th>
                <th>Status</th>
                <th title="Textract confidence">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className={t.flag === 'LOW' || t.flag === 'HIGH' ? 'row-bad' : ''}>
                  <td>{t.testName}</td>
                  <td className="num">{t.rawValue}</td>
                  <td>{t.unit}</td>
                  <td>{t.rangeText}</td>
                  <td><FlagBadge flag={t.flag} /></td>
                  <td className={(t.confidence ?? 100) < LOW_CONFIDENCE ? 'warn-text' : 'muted'}>
                    {t.confidence != null ? `${Math.round(t.confidence)}%` : '–'}
                    {(t.confidence ?? 100) < LOW_CONFIDENCE && ' ⚠'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.some((t) => (t.confidence ?? 100) < LOW_CONFIDENCE) && (
            <p className="warn-text small">⚠ Low-confidence values: please double-check them against the original.</p>
          )}
        </div>

        <aside className="original">
          <div className="muted small">Original document</div>
          {fileUrl &&
            (isPdf ? (
              <a className="primary" href={fileUrl} target="_blank" rel="noreferrer">Open PDF ↗</a>
            ) : (
              <a href={fileUrl} target="_blank" rel="noreferrer">
                <img src={fileUrl} alt="Uploaded lab report" />
              </a>
            ))}
        </aside>
      </div>
    </section>
  );
}

export function FlagBadge({ flag }: { flag?: string | null }) {
  const f = flag ?? 'UNKNOWN';
  const label = f === 'LOW' ? '▼ Low' : f === 'HIGH' ? '▲ High' : f === 'NORMAL' ? 'Normal' : 'No range';
  return <span className={`badge ${f.toLowerCase()}`}>{label}</span>;
}
