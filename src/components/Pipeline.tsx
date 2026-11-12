/**
 * "What AWS is doing right now" card. Nodes light up and a beam travels
 * along each link as the upload moves through Upload -> Analyze -> Save.
 */
export type Stage = 'idle' | 'upload' | 'analyze' | 'save' | 'done' | 'error';

const NODES = [
  { key: 'browser', label: 'Browser', sub: 'React app' },
  { key: 's3', label: 'Amazon S3', sub: 'presigned PUT' },
  { key: 'lambda', label: 'Lambda', sub: 'Function URL' },
  { key: 'textract', label: 'Textract', sub: 'TABLES + QUERIES' },
  { key: 'ddb', label: 'DynamoDB', sub: 'PutItem' },
] as const;

// Which link (between node i and i+1) is active in each stage
const ACTIVE_LINKS: Record<Stage, number[]> = {
  idle: [],
  upload: [0],
  analyze: [1, 2],
  save: [3],
  done: [],
  error: [],
};
// How many nodes have been reached in each stage
const REACHED: Record<Stage, number> = { idle: 0, upload: 1, analyze: 3, save: 4, done: 5, error: 0 };

export interface StepInfo {
  key: 'upload' | 'analyze' | 'save';
  label: string;
  detail: string;
  time?: string;
}

export default function Pipeline({
  stage,
  steps,
  progress,
  failedStep,
}: {
  stage: Stage;
  steps: StepInfo[];
  progress: number;
  failedStep?: number;
}) {
  const reached = REACHED[stage];
  const order: Stage[] = ['upload', 'analyze', 'save'];
  const current = order.indexOf(stage);

  const stepState = (i: number) => {
    if (stage === 'done') return 'done';
    if (stage === 'error') {
      if (failedStep == null) return 'idle';
      return i < failedStep ? 'done' : i === failedStep ? 'failed' : 'idle';
    }
    return current > i ? 'done' : current === i ? 'active' : 'idle';
  };

  return (
    <div className={`pipeline-card stage-${stage}`}>
      <div className="pipe-title">
        <span className="dot-live" /> Live AWS pipeline
      </div>
      <div className="pipe-nodes">
        {NODES.map((n, i) => (
          <div key={n.key} className="pipe-node-wrap">
            <div className={`pipe-node ${i < reached ? 'lit' : ''} ${i === reached - 1 && stage !== 'done' ? 'pulse' : ''}`}>
              <AwsGlyph name={n.key} />
            </div>
            <div className="pipe-node-label">{n.label}</div>
            <div className="pipe-node-sub">{n.sub}</div>
            {i < NODES.length - 1 && (
              <div className={`pipe-link ${ACTIVE_LINKS[stage].includes(i) ? 'flow' : ''} ${i < reached - 1 || stage === 'done' ? 'passed' : ''}`}>
                <span className="beam" />
              </div>
            )}
          </div>
        ))}
      </div>

      <ol className="pipe-steps">
        {steps.map((s, i) => {
          const state = stepState(i);
          return (
            <li key={s.key} className={`pipe-step ${state}`}>
              <span className="step-dot">{state === 'done' ? '✓' : state === 'failed' ? '✕' : i + 1}</span>
              <span className="step-text">
                <strong>
                  {s.label}
                  {s.key === 'upload' && stage === 'upload' ? ` · ${progress}%` : ''}
                </strong>
                <small>{s.detail}</small>
              </span>
              <span className="step-time num">{s.time ?? ''}</span>
              {s.key === 'upload' && stage === 'upload' && (
                <span className="step-progress" style={{ transform: `scaleX(${progress / 100})` }} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Simple generic glyphs for each service (not official AWS icons). */
function AwsGlyph({ name }: { name: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'browser':
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M6.5 6.5h.01M9 6.5h.01" /></svg>;
    case 's3':
      return <svg {...common}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
    case 'lambda':
      return <svg {...common}><path d="M6 20 11 9 8.5 4H6" /><path d="M11 9l5 11h3" /></svg>;
    case 'textract':
      return <svg {...common}><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>;
    default:
      return <svg {...common}><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" /><path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7" /><path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" /></svg>;
  }
}
