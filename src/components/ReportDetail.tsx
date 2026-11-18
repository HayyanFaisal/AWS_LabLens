import { Fragment, useEffect, useMemo, useState } from 'react';
import { getFileUrl, getReport } from '../api';
import { formatDate, isAbnormal } from '../lib/format';
import { ageFrom, nameMatch } from '../lib/health';
import { PANELS, testInfo, type PanelId } from '../lib/testLibrary';
import type { Profile, Report, TestResult } from '../types';
import { FlagBadge, Icon, OrganIcon, RangeBar, Spinner } from './ui';

const LOW_CONFIDENCE = 80; // same threshold as the API (rules.ts)
type Row = TestResult & { index: number; panel: PanelId };

export default function ReportDetail({ reportId, onBack, profile }: { reportId: string; onBack: () => void; profile: Profile }) {
  const [report, setReport] = useState<Report | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
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

  const rows: Row[] = useMemo(
    () => (report?.tests ?? []).map((t, index) => ({ ...t, index, panel: testInfo(t.testName).panel })),
    [report],
  );

  if (error) return <div className="page"><div className="alert error"><Icon name="alert" /> {error}</div></div>;
  if (!report) return <div className="page"><div className="card center"><Spinner /></div></div>;

  const shown = onlyAbnormal ? rows.filter((t) => isAbnormal(t.flag)) : rows;
  const groups = grouped
    ? PANELS.map((p) => ({ panel: p, rows: shown.filter((r) => r.panel === p.id) })).filter((g) => g.rows.length)
    : [{ panel: null, rows: shown }];
  const isPdf = /\.pdf$/i.test(report.fileKey);
  const lowConf = rows.filter((t) => (t.confidence ?? 100) < LOW_CONFIDENCE).length;
  const abnormal = report.abnormalCount ?? 0;
  const match = nameMatch(profile.fullName, report.patientName);
  const ageAtTest = report.reportDate ? ageFrom(profile.dateOfBirth, new Date(report.reportDate)) : null;

  return (
    <div className="page detail">
      <div className="detail-top no-print">
        <button className="link-back" onClick={onBack}><Icon name="back" size={16} /> All reports</button>
        <div className="detail-actions">
          {fileUrl && <a className="btn-ghost" href={fileUrl} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> Original</a>}
          <button className="btn-secondary" onClick={() => window.print()}><Icon name="print" size={16} /> Print summary</button>
        </div>
      </div>

      <header className="card detail-head">
        <div className="dh-main">
          <div className="eyebrow">{formatDate(report.reportDate)}</div>
          <h1>{report.labName || report.fileName}</h1>
          <div className="dh-meta">
            <span className={`patient ${match}`}>
              <Icon name="user" size={15} /> {report.patientName ?? 'Patient name not found'}
              {match === 'match' && <span className="chip ok"><Icon name="check" size={12} /> matches profile</span>}
              {match === 'mismatch' && <span className="chip warn">not {profile.fullName}</span>}
            </span>
            {ageAtTest != null && match !== 'mismatch' && <span><Icon name="calendar" size={15} /> Age at test: {ageAtTest}</span>}
            <span className="no-print"><Icon name="scan" size={15} /> {report.pages ?? 1} page(s) · {report.demo ? 'demo sample' : <>Textract {report.mode === 'async' ? 'async job' : 'sync call'} · {report.blockCount ?? '–'} blocks</>}</span>
          </div>
        </div>
        <div className="stat-row compact">
          <div className="stat"><Icon name="file" /><div className="stat-value num">{rows.length}</div><div className="stat-label">tests</div></div>
          <div className={`stat ${abnormal ? 'bad' : 'good'}`}><Icon name={abnormal ? 'alert' : 'check'} /><div className="stat-value num">{abnormal}</div><div className="stat-label">out of range</div></div>
          <div className={`stat ${lowConf ? 'warn' : ''}`}><Icon name="scan" /><div className="stat-value num">{lowConf}</div><div className="stat-label">low confidence</div></div>
        </div>
      </header>

      {report.demo && (
        <div className="demo-banner no-print">
          <Icon name="info" size={16} /> Demo report: the rows of this sample file are preloaded and flagged by LabLens's own rules. Upload a file on Scan report to see Amazon Textract read it live (with confidence scores).
        </div>
      )}

      {!!report.warnings?.length && (
        <ul className="warnings no-print">
          {report.warnings.map((w) => <li key={w}><Icon name="alert" size={15} /> {w}</li>)}
        </ul>
      )}

      <div className="detail-grid">
        <section className="card table-card">
          <div className="table-tools no-print">
            <div className="seg-choice small" role="radiogroup" aria-label="Order">
              <button type="button" className={grouped ? 'on' : ''} onClick={() => setGrouped(true)}>By body system</button>
              <button type="button" className={!grouped ? 'on' : ''} onClick={() => setGrouped(false)}>As printed</button>
            </div>
            <label className="switch">
              <input type="checkbox" checked={onlyAbnormal} onChange={(e) => setOnlyAbnormal(e.target.checked)} />
              <span className="switch-track"><span className="switch-thumb" /></span>
              Only out-of-range
            </label>
          </div>
          <div className="table-scroll">
            <table className="results">
              <thead>
                <tr>
                  <th>Test</th>
                  <th className="right">Result</th>
                  <th className="no-print">Where it sits</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="right no-print" title="Textract confidence">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.panel?.id ?? 'all'}>
                    {g.panel && (
                      <tr className="group-row">
                        <td colSpan={6}>
                          <span className="group-icon" style={{ color: g.panel.color }}><OrganIcon src={g.panel.icon} size={18} /></span> {g.panel.name}
                          <span className="muted small"> · {g.rows.length} test{g.rows.length > 1 ? 's' : ''}{g.rows.some((r) => isAbnormal(r.flag)) ? ` · ${g.rows.filter((r) => isAbnormal(r.flag)).length} flagged` : ''}</span>
                        </td>
                      </tr>
                    )}
                    {g.rows.map((t) => (
                      <TestRow key={t.index} t={t} hot={hover === t.index} open={open === t.index}
                        onHover={setHover} onToggle={() => setOpen(open === t.index ? null : t.index)} />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {!!report.queryAnswers?.length && (
            <div className="qa-inline no-print">
              <span className="qa-label"><Icon name="sparkle" size={14} /> Textract Queries</span>
              {report.queryAnswers.map((q, i) => (
                <span key={i} className="qa-chip" title={q.question ?? ''}>
                  {q.question?.replace(/^What is the /i, '').replace(/\?$/, '')}: <strong>{q.answer ?? '—'}</strong>
                  {q.confidence != null && <em>{Math.round(q.confidence)}%</em>}
                </span>
              ))}
            </div>
          )}
          <p className="disclaimer">Explanations are general information to help you prepare questions for your doctor. They are not a diagnosis.</p>
        </section>

        <aside className="card doc-card no-print">
          <div className="doc-head">
            <span className="small strong">Original document</span>
            {!isPdf && (
              <label className="switch small">
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
                <span className="switch-track"><span className="switch-thumb" /></span>
                {report.demo ? 'Row boxes' : 'Textract boxes'}
              </label>
            )}
          </div>
          {fileUrl &&
            (isPdf ? (
              <div className="pdf-box">
                <Icon name="file" size={36} />
                <p className="muted small">PDFs are read with the asynchronous Textract job. The box overlay is shown for image uploads.</p>
                <a className="btn-primary" href={fileUrl} target="_blank" rel="noreferrer">Open PDF <Icon name="external" size={15} /></a>
              </div>
            ) : (
              <DocWithBoxes url={fileUrl} tests={rows} show={showBoxes} hover={hover} setHover={setHover} onPick={setOpen} />
            ))}
        </aside>
      </div>
    </div>
  );
}

function TestRow({ t, hot, open, onHover, onToggle }: { t: Row; hot: boolean; open: boolean; onHover: (i: number | null) => void; onToggle: () => void }) {
  const info = testInfo(t.testName);
  const meaning = t.flag === 'HIGH' ? info.high : t.flag === 'LOW' ? info.low : null;
  return (
    <>
      <tr
        className={`test-row ${isAbnormal(t.flag) ? 'abn' : ''} ${hot ? 'hot' : ''} ${open ? 'open' : ''}`}
        onMouseEnter={() => onHover(t.index)}
        onMouseLeave={() => onHover(null)}
        onClick={onToggle}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
      >
        <td className="t-name"><Icon name="chevron" size={14} /> {t.testName}</td>
        <td className="right num strong">{t.rawValue} <span className="unit">{t.unit}</span></td>
        <td className="no-print"><RangeBar test={t} /></td>
        <td className="num muted small">{t.rangeText ?? '–'}</td>
        <td><FlagBadge flag={t.flag} /></td>
        <td className={`right num small no-print ${(t.confidence ?? 100) < LOW_CONFIDENCE ? 'warn-text' : 'muted'}`}>
          {t.confidence != null ? `${Math.round(t.confidence)}%` : '–'}
        </td>
      </tr>
      {open && (
        <tr className="explain-row">
          <td colSpan={6}>
            <div className="explain">
              <p><strong>What it measures.</strong> {info.about}</p>
              {meaning && <p className={t.flag === 'HIGH' ? 'bad-text' : 'low-text'}><strong>{t.flag === 'HIGH' ? 'When it is high' : 'When it is low'}.</strong> {meaning}</p>}
              {!meaning && t.flag === 'NORMAL' && <p className="good-text"><strong>Within the printed range</strong> of {t.rangeText}.</p>}
              <p className="muted small">Read by Textract with {t.confidence != null ? `${Math.round(t.confidence)}%` : 'unknown'} confidence on page {t.page ?? 1}.</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * The uploaded image with one box per test row. Textract gives every block a
 * BoundingBox as fractions of the page, so a box is just CSS percentages.
 */
function DocWithBoxes({
  url, tests, show, hover, setHover, onPick,
}: {
  url: string;
  tests: Row[];
  show: boolean;
  hover: number | null;
  setHover: (i: number | null) => void;
  onPick: (i: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`doc ${loaded ? 'loaded' : ''}`}>
      <img src={url} alt="Uploaded lab report" onLoad={() => setLoaded(true)} />
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
            onClick={() => onPick(t.index)}
            title={`${t.testName}: ${t.rawValue} ${t.unit ?? ''} (${t.flag})`}
          />
        ))}
    </div>
  );
}
