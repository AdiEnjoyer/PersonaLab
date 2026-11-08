import { useEffect, useState } from 'react';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { Select } from '../../../ui/form/Select';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { RATING_BANDS, TOPICS } from '../constants';
import { loadTips, readChessRating } from '../data/view';
import { filterTips } from '../logic/tips';
import type { RatingBand, Tip } from '../types';

/** `/chess/tips`: browse the Tips_Library by band (default: the Chess_Rating's band) and topic (R41.8). */
export default function TipsScreen() {
  const [tips, setTips] = useState<Tip[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [band, setBand] = useState<string>();
  const [topic, setTopic] = useState('');
  const [open, setOpen] = useState<string>();

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadTips().then(
      (t) => live && setTips(t),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    let live = true;
    readChessRating().then(
      (r) => live && setBand((current) => current ?? r.band),
      () => live && setBand((current) => current ?? ''),
    );
    return () => {
      live = false;
    };
  }, []);

  if (failed) return <ErrorPanel message="The tips could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />;
  if (tips === undefined || band === undefined) return <Skeleton rows={4} />;

  const shown = filterTips(tips, band === '' ? undefined : (band as RatingBand), topic === '' ? undefined : topic);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Tips</h1>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Rating band" value={band} placeholder="All bands" options={RATING_BANDS.map((b) => ({ value: b, label: b }))} onChange={setBand} />
        <Select label="Topic" value={topic} placeholder="All topics" options={TOPICS.map((t) => ({ value: t, label: t }))} onChange={setTopic} />
      </div>
      {shown.length === 0 ? (
        <CardFrame>
          <EmptyState title="No tips match">
            <Button
              onClick={() => {
                setBand('');
                setTopic('');
              }}
            >
              Clear filters
            </Button>
          </EmptyState>
        </CardFrame>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((t) => (
            <li key={t.id}>
              <CardFrame className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-expanded={open === t.id}
                  className="tap text-left text-base font-medium"
                  onClick={() => setOpen(open === t.id ? undefined : t.id)}
                >
                  {t.title}
                </button>
                {open === t.id ? (
                  <div className="flex flex-col gap-1">
                    <p>{t.body}</p>
                    <p className="text-sm text-muted">
                      {t.band} · {t.topics.join(', ')}
                    </p>
                  </div>
                ) : null}
              </CardFrame>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
