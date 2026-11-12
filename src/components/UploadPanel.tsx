import { useRef, useState } from 'react';
import { analyze, getUploadUrl, uploadToS3 } from '../api';
import { formatMs } from '../lib/format';
import type { Report } from '../types';
import Pipeline, { type Stage, type StepInfo } from './Pipeline';
import { CountUp, Icon } from './ui';

const ACCEPT = /\.(png|jpe?g|pdf|tiff?)$/i;
const MAX_BYTES = 10 * 1024 * 1024;

interface Timings {
  upload?: number;
  analyze?: number;
  save?: number;
  total?: number;
}

export default function UploadPanel({ onOpen }: { onOpen: (reportId: string) => void }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [timings, setTimings] = useState<Timings>({});
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [failedStep, setFailedStep] = useState<number | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = stage === 'upload' || stage === 'analyze' || stage === 'save';

  async function handleFile(file: File) {
    if (!ACCEPT.test(file.name)) return setError('Please choose a PNG, JPG, PDF or TIFF file.');
    if (file.size > MAX_BYTES) return setError('That file is larger than 10 MB.');
    setError(null);
    setReport(null);
    setTimings({});
    setProgress(0);
    setFileName(file.name);
    setFailedStep(undefined);
    const t0 = performance.now();
    let step = 0; // which step we are in, so an error can be shown on the right one

    try {
      // 1) Upload: ask the API for a presigned URL, then PUT the file straight into S3
      setStage('upload');
      const { uploadUrl, fileKey, contentType } = await getUploadUrl(file.name, file.size);
      await uploadToS3(uploadUrl, file, contentType, setProgress);
      const t1 = performance.now();
      setTimings({ upload: t1 - t0 });

      // 2) Analyze: the Lambda runs Textract + our parser, 3) and saves to DynamoDB
      step = 1;
      setStage('analyze');
      const result = await analyze(fileKey, file.name);
      const t2 = performance.now();
      setStage('save');
      await new Promise((r) => setTimeout(r, 450)); // let the "Save" step be visible
      setTimings({ upload: t1 - t0, analyze: result.textractMs, save: result.saveMs, total: t2 - t0 });
      setReport(result); // a rejected report is still uploaded, analyzed and saved (as FAILED)
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFailedStep(step);
      setStage('error');
    }
  }

  const steps: StepInfo[] = [
    { key: 'upload', label: 'Upload', detail: 'Presigned URL → Amazon S3', time: timings.upload ? formatMs(timings.upload) : undefined },
    { key: 'analyze', label: 'Analyze', detail: 'Lambda → Amazon Textract', time: timings.analyze ? formatMs(timings.analyze) : undefined },
    { key: 'save', label: 'Save', detail: 'Lambda → DynamoDB', time: timings.save != null ? formatMs(timings.save) : undefined },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="hero-eyebrow"><span className="dot-live" /> Amazon Textract · TABLES + QUERIES</div>
          <h1>Read any lab report in seconds.</h1>
          <p className="muted">A photo (PNG/JPG) or a PDF. It goes into your private S3 folder, Textract reads it, and the results are saved to your history.</p>
        </div>
      </header>

      <div className="upload-grid">
        <div className="card">
          <div
            className={`dropzone ${dragOver ? 'over' : ''} ${busy ? 'disabled' : ''}`}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !busy) handleFile(f);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
          >
            <div className="drop-icon"><Icon name="upload" size={26} /></div>
            <div className="drop-title">{busy ? `Processing ${fileName}…` : <>Drop a report here or <u>browse</u></>}</div>
            <div className="muted small">PNG · JPG · PDF (multi-page) · TIFF · up to 10 MB</div>
            <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.pdf,.tif,.tiff" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
          </div>

          <details className="rules">
            <summary><Icon name="info" size={16} /> What counts as a lab report?</summary>
            <ul>
              <li>A printed <strong>results table</strong> with a header row, e.g. <em>Test | Result | Unit | Reference Range</em></li>
              <li>At least <strong>3 numeric results</strong> and at least one <strong>reference range</strong></li>
              <li>Typed, not handwritten. Text results like "Negative" are skipped</li>
              <li>Anything else (invoices, letters, photos) is saved as <strong>Failed</strong> with the reason</li>
            </ul>
          </details>
        </div>

        <Pipeline stage={stage} steps={steps} progress={progress} failedStep={failedStep} />
      </div>

      {error && (
        <div className="alert error" role="alert"><Icon name="alert" /> {error}</div>
      )}

      {report && report.status === 'FAILED' && <Rejected report={report} />}
      {report && report.status === 'DONE' && <Result report={report} totalMs={timings.total} onOpen={onOpen} />}
    </div>
  );
}

function Result({ report, totalMs, onOpen }: { report: Report; totalMs?: number; onOpen: (id: string) => void }) {
  const abnormal = report.abnormalCount ?? 0;
  return (
    <section className="card result-card enter">
      <div className="result-head">
        <div>
          <div className="eyebrow">Extraction complete</div>
          <h2>{report.labName || report.fileName}</h2>
          <div className="muted small">
            {report.patientName ?? 'Unknown patient'} · Textract{' '}
            <strong>{report.mode === 'async' ? 'async job (PDF)' : 'sync call (image)'}</strong> · {report.blockCount ?? 0} blocks
          </div>
        </div>
        <button className="btn-primary" onClick={() => onOpen(report.reportId)}>
          View results <Icon name="arrow" size={16} />
        </button>
      </div>

      <div className="stat-row">
        <div className="stat"><div className="stat-value"><CountUp value={report.testCount ?? 0} /></div><div className="stat-label">tests found</div></div>
        <div className={`stat ${abnormal ? 'bad' : 'good'}`}><div className="stat-value"><CountUp value={abnormal} /></div><div className="stat-label">out of range</div></div>
        <div className="stat indigo"><div className="stat-value"><CountUp value={report.pages ?? 1} /> / <CountUp value={report.tables ?? 0} /></div><div className="stat-label">pages / tables</div></div>
        <div className="stat violet"><div className="stat-value"><CountUp value={(totalMs ?? 0) / 1000} decimals={1} />s</div><div className="stat-label">end to end</div></div>
      </div>

      {!!report.warnings?.length && (
        <ul className="warnings">
          {report.warnings.map((w) => <li key={w}><Icon name="alert" size={15} /> {w}</li>)}
        </ul>
      )}

      <h3 className="section-title">Textract Queries <span className="muted small">questions asked in plain English</span></h3>
      <div className="queries">
        {(report.queryAnswers ?? []).map((q, i) => (
          <div key={i} className="query" style={{ ['--i' as string]: i }}>
            <div className="query-q">{q.question}</div>
            <div className="query-a">{q.answer ?? <span className="muted">not found</span>}</div>
            <div className="conf">
              <span className="conf-track"><span className="conf-fill" style={{ transform: `scaleX(${(q.confidence ?? 0) / 100})` }} /></span>
              <span className="num small">{q.confidence != null ? `${q.confidence}%` : '–'}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rejected({ report }: { report: Report }) {
  return (
    <section className="card rejected enter" role="alert">
      <div className="rejected-icon"><Icon name="x" size={22} /></div>
      <div>
        <div className="eyebrow bad-text">Not accepted</div>
        <h2>{report.fileName}</h2>
        <p>{report.errorMessage}</p>
        <p className="muted small">
          {report.blockCount ? `Textract found ${report.tables ?? 0} table(s) in ${report.blockCount} blocks. ` : ''}
          The file is kept in My reports as <strong>Failed</strong> so you can delete it.
        </p>
      </div>
    </section>
  );
}
