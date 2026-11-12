import { useRef, useState } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { client, type Flag } from '../client';

type Step = 'idle' | 'uploading' | 'analyzing' | 'saving' | 'done' | 'error';

interface Summary {
  reportId: string;
  mode: string;
  pages: number;
  tables: number;
  tests: number;
  abnormal: number;
  seconds: number;
  queryAnswers: { question?: string | null; answer?: string | null; confidence?: number | null }[];
}

const STEPS: { key: Step; label: string; detail: string }[] = [
  { key: 'uploading', label: 'Upload', detail: 'Amplify Storage → Amazon S3 (private folder)' },
  { key: 'analyzing', label: 'Analyze', detail: 'Amazon Textract → Tables + Queries' },
  { key: 'saving', label: 'Save', detail: 'Amplify Data → AppSync + DynamoDB' },
];

export default function UploadPanel({ onDone }: { onDone: (reportId: string) => void }) {
  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!/\.(png|jpe?g|pdf|tiff?)$/i.test(file.name)) {
      setError('Please choose a PNG, JPG, PDF or TIFF file.');
      return;
    }
    setError(null);
    setSummary(null);
    setProgress(0);
    const started = Date.now();
    let reportId: string | null = null;

    try {
      // 1) Upload the file to the user's private S3 folder
      setStep('uploading');
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const { path: fileKey } = await uploadData({
        path: ({ identityId }) => `reports/${identityId}/${Date.now()}-${safeName}`,
        data: file,
        options: {
          contentType: file.type || undefined,
          onProgress: ({ transferredBytes, totalBytes }) =>
            totalBytes && setProgress(Math.round((transferredBytes / totalBytes) * 100)),
        },
      }).result;

      // Create the report record straight away (shows as "Processing" in the list)
      const created = await client.models.Report.create({
        fileKey,
        fileName: file.name,
        status: 'PROCESSING',
      });
      const newId = created.data?.id;
      if (!newId) throw new Error('Could not create report record');
      reportId = newId;

      // 2) Ask the Lambda to run Textract on it
      setStep('analyzing');
      const { data: result, errors } = await client.mutations.processReport({ fileKey });
      if (errors?.length || !result) {
        throw new Error(errors?.[0]?.message ?? 'Textract processing failed');
      }

      // 3) Save every extracted test as its own row
      setStep('saving');
      const tests = (result.tests ?? []).filter((t): t is NonNullable<typeof t> => !!t);
      const reportDate = result.reportDate ?? new Date().toISOString().slice(0, 10);
      await Promise.all(
        tests.map((t) =>
          client.models.TestResult.create({
            reportId: newId,
            reportDate,
            testName: t.testName,
            value: t.value,
            rawValue: t.rawValue,
            unit: t.unit,
            rangeText: t.rangeText,
            rangeLow: t.rangeLow,
            rangeHigh: t.rangeHigh,
            flag: (t.flag ?? 'UNKNOWN') as Flag,
            confidence: t.confidence,
            page: t.page,
          }),
        ),
      );
      const abnormal = tests.filter((t) => t.flag === 'LOW' || t.flag === 'HIGH').length;
      await client.models.Report.update({
        id: newId,
        status: 'DONE',
        patientName: result.patientName,
        labName: result.labName,
        reportDate,
        pages: result.pages,
        mode: result.mode,
        testCount: tests.length,
        abnormalCount: abnormal,
      });

      setSummary({
        reportId: newId,
        mode: result.mode ?? '',
        pages: result.pages ?? 1,
        tables: result.tables ?? 0,
        tests: tests.length,
        abnormal,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        queryAnswers: (result.queryAnswers ?? []).filter((q): q is NonNullable<typeof q> => !!q),
      });
      setStep('done');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStep('error');
      if (reportId) {
        await client.models.Report.update({ id: reportId, status: 'FAILED', errorMessage: message });
      }
    }
  }

  const busy = step === 'uploading' || step === 'analyzing' || step === 'saving';
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <section className="panel">
      <h1>Upload a lab report</h1>
      <p className="muted">
        Photo (PNG/JPG) or PDF. Textract reads the results table and answers questions about the
        report, then everything is saved to your private history.
      </p>

      <div
        className={`dropzone ${dragOver ? 'over' : ''} ${busy ? 'disabled' : ''}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) handleFile(f);
        }}
      >
        <div className="drop-icon">⬆</div>
        <div>
          <strong>Drop a report here</strong> or click to choose a file
        </div>
        <div className="muted small">PNG · JPG · PDF (multi-page OK) · TIFF</div>
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,.tif,.tiff"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {step !== 'idle' && (
        <ol className="pipeline">
          {STEPS.map((s, i) => {
            const state =
              step === 'done' || i < stepIndex
                ? 'done'
                : i === stepIndex
                  ? 'active'
                  : step === 'error'
                    ? 'idle'
                    : 'idle';
            return (
              <li key={s.key} className={`pipe-step ${state}`}>
                <span className="dot">{state === 'done' ? '✓' : i + 1}</span>
                <div>
                  <div className="pipe-label">
                    {s.label}
                    {s.key === 'uploading' && step === 'uploading' && ` · ${progress}%`}
                  </div>
                  <div className="muted small">{s.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {error && <div className="alert error">⚠ {error}</div>}

      {summary && (
        <div className="result-card">
          <div className="stats">
            <Stat label="Tests found" value={summary.tests} />
            <Stat label="Out of range" value={summary.abnormal} tone={summary.abnormal ? 'bad' : 'good'} />
            <Stat label="Pages / tables" value={`${summary.pages} / ${summary.tables}`} />
            <Stat label="Total time" value={`${summary.seconds}s`} />
          </div>
          <div className="muted small">
            Textract mode: <strong>{summary.mode === 'async' ? 'Asynchronous job (PDF)' : 'Synchronous call (image)'}</strong>
          </div>

          <h3>Textract Queries</h3>
          <table className="grid compact">
            <thead>
              <tr>
                <th>Question asked</th>
                <th>Answer</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {summary.queryAnswers.map((q, i) => (
                <tr key={i}>
                  <td>{q.question}</td>
                  <td>{q.answer ?? <span className="muted">not found</span>}</td>
                  <td>{q.confidence != null ? `${q.confidence}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="primary" onClick={() => onDone(summary.reportId)}>
            View extracted results →
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
