import { useEffect, useState } from 'react';
import { getFileUrl, getReport } from '../api';
import { formatDate, isAbnormal } from '../lib/format';
import type { Report, TestResult } from '../types';
import { FlagBadge, Icon, RangeBar, Spinner } from './ui';

const LOW_CONFIDENCE = 90;

export default function ReportDetail({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [r, url] = await Promise.all([getReport(reportId), getFileUrl(reportId)]);
        setReport(r);
        setFileUrl(url); // presigned GET: a temporary link to the private S3 object
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [reportId]);

  if (error) return <div className="page"><div className="alert error"><Icon name="alert" /> {error}</div></div>;
  if (!report) return <div className="page"><div className="card center"><Spinner /></div></div>;

  const tests = (report.tests ?? []).map((t, index) => ({ ...t, index }));
  const shown = onlyAbnormal ? tests.filter((t) => isAbnormal(t.flag)) : tests;
  const isPdf = /\.pdf$/i.test(report.fileKey);
  const lowConf = tests.filter((t) => (t.confidence ?? 100) < LOW_CONFIDENCE).length;
  const abnormal = report.abnormalCount ?? 0;

  return (
    <div className="page">
      <button className="link-back" onClick={onBack}><Icon name="back" size={16} /> All reports</button>

      <header className="detail-head card">
        <div>
          <div className="eyebrow">{formatDate(report.reportDate)}</div>
          <h1>{report.labName || report.fileName}</h1>
          <div className="muted small">
            {report.patientName ?? 'Unknown patient'} · {report.pages ?? 1} page(s) · Textract{' '}
            {report.mode === 'async' ? 'async job' : 'sync call'} · {report.blockCount ?? '–'} blocks
          </div>
        </div>
        <div className="stat-row compact">
          <div className="stat"><div className="stat-value num">{tests.length}</div><div className="stat-label">tests</div></div>
          <div className={`stat ${abnormal ? 'bad' : 'good'}`}><div className="stat-value num">{abnormal}</div><div className="stat-label">out of range</div></div>
          <div className={`stat ${lowConf ? 'warn' : 'indigo'}`}><div className="stat-value num">{lowConf}</div><div className="stat-label">low confidence</div></div>
        </div>
      </header>

      {!!report.warnings?.length && (
        <ul className="warnings">
          {report.warnings.map((w) => <li key={w}><Icon name="alert" size={15} /> {w}</li>)}
        </ul>
      )}

      <div className="detail-grid">
        <section className="card table-card">
          <div className="table-tools">
            <label className="switch">
              <input type="checkbox" checked={onlyAbnormal} onChange={(e) => setOnlyAbnormal(e.target.checked)} />
              <span className="switch-track"><span className="switch-thumb" /></span>
              Only out-of-range
            </label>
            <span className="legend small muted">
              <span className="lg-band" /> reference range <span className="lg-dot" /> result
            </span>
          </div>
          <div className="table-scroll">
            <table className="results">
              <thead>
                <tr>
                  <th>Test</th>
                  <th className="right">Result</th>
                  <th>Where it sits</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="right" title="Textract confidence">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr
                    key={t.index}
                    className={`${isAbnormal(t.flag) ? 'abn' : ''} ${hover === t.index ? 'hot' : ''}`}
                    onMouseEnter={() => setHover(t.index)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <td className="t-name">{t.testName}</td>
                    <td className="right num strong">{t.rawValue} <span className="unit">{t.unit}</span></td>
                    <td><RangeBar test={t} /></td>
                    <td className="num muted small">{t.rangeText ?? '–'}</td>
                    <td><FlagBadge flag={t.flag} /></td>
                    <td className={`right num small ${(t.confidence ?? 100) < LOW_CONFIDENCE ? 'warn-text' : 'muted'}`}>
                      {t.confidence != null ? `${Math.round(t.confidence)}%` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!report.queryAnswers?.length && (
            <div className="qa-inline">
              {report.queryAnswers.map((q, i) => (
                <span key={i} className="qa-chip" title={q.question ?? ''}>
                  {q.question?.replace(/^What is the /i, '').replace(/\?$/, '')}: <strong>{q.answer ?? '—'}</strong>
                  {q.confidence != null && <em>{Math.round(q.confidence)}%</em>}
                </span>
              ))}
            </div>
          )}
        </section>

        <aside className="card doc-card">
          <div className="doc-head">
            <span className="small strong">Original document</span>
            {!isPdf && (
              <label className="switch small">
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                <span className="switch-track"><span className="switch-thumb" /></span>
                Textract boxes
              </label>
            )}
          </div>
          {fileUrl &&
            (isPdf ? (
              <div className="pdf-box">
                <Icon name="file" size={36} />
                <p className="muted small">PDFs were read with the asynchronous Textract job. Box overlay is shown for image uploads.</p>
                <a className="btn-primary" href={fileUrl} target="_blank" rel="noreferrer">Open PDF <Icon name="external" size={15} /></a>
              </div>
            ) : (
              <DocWithBoxes url={fileUrl} tests={tests} show={showBoxes} hover={hover} setHover={setHover} />
            ))}
        </aside>
      </div>
    </div>
  );
}

/**
 * The uploaded image with one box per test row. Textract gives every block a
 * BoundingBox as fractions of the page, so a box is just CSS percentages.
 */
function DocWithBoxes({
  url, tests, show, hover, setHover,
}: {
  url: string;
  tests: (TestResult & { index: number })[];
  show: boolean;
  hover: number | null;
  setHover: (i: number | null) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`doc ${loaded ? 'loaded' : ''}`}>
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="Uploaded lab report" onLoad={() => setLoaded(true)} />
      </a>
      {show && loaded &&
        tests.filter((t) => t.box && (t.page ?? 1) === 1).map((t) => (
          <span
            key={t.index}
            className={`tbox ${t.flag.toLowerCase()} ${hover === t.index ? 'hot' : ''}`}
            style={{
              left: `${t.box!.left * 100}%`,
              top: `${t.box!.top * 100}%`,
              width: `${t.box!.width * 100}%`,
              height: `${t.box!.height * 100}%`,
              ['--i' as string]: t.index,
            }}
            onMouseEnter={() => setHover(t.index)}
            onMouseLeave={() => setHover(null)}
            title={`${t.testName}: ${t.rawValue} ${t.unit ?? ''} (${t.flag})`}
          />
        ))}
    </div>
  );
}
