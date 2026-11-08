import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { useSetting } from '../../../core/settings/useSetting';
import { NumberField } from '../../../ui/form/NumberField';
import { Select } from '../../../ui/form/Select';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { toast } from '../../../ui/toast/toastStore';
import { resetChessComRoute } from '../data/client';
import { readRatings, verifyUsername } from '../data/ratings';
import { chessComMessage, PROXY_GUIDE_URL } from '../net/messages';
import { CHESS_SETTING_KEYS, usernameSchema, type RatingSource } from '../settings';

const FORMAT_HINT = '3 to 25 characters: letters A–Z, digits 0–9, "_" and "-".';

function UsernameField() {
  const [stored] = useSetting<string>(CHESS_SETTING_KEYS.username);
  const [text, setText] = useState(stored);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    setText(stored);
  }, [stored]);

  const commit = async () => {
    if (busy.current) return;
    const trimmed = text.trim();
    if (trimmed === stored) {
      setError(undefined);
      setRetry(false);
      return;
    }
    if (!usernameSchema.safeParse(trimmed).success) {
      setError(FORMAT_HINT);
      setRetry(false);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(undefined);
    setRetry(false);
    try {
      const result = await verifyUsername(trimmed);
      if (result.ok) return;
      if (result.error.kind === 'format') setError(FORMAT_HINT);
      else if (result.error.kind === 'write') toast.show({ message: 'Not saved: the database write failed.', kind: 'error' });
      else {
        setError(chessComMessage(result.error));
        setRetry(result.error.kind !== 'not-found');
      }
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void commit();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextField
        label="Chess.com username"
        value={text}
        onChange={setText}
        error={error}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={pending}
        onBlur={() => void commit()}
      />
      <p className="text-xs text-muted">{FORMAT_HINT} Checked with Chess.com before it is saved.</p>
      {pending ? (
        <p role="status" className="text-sm text-muted">
          Checking with Chess.com…
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Save username
        </Button>
        {retry && !pending ? (
          <Button variant="secondary" onClick={() => void commit()}>
            Retry
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ProxyField() {
  const [stored, commit] = useSetting<string>(CHESS_SETTING_KEYS.proxyUrl);
  const [text, setText] = useState(stored);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setText(stored);
    setError(undefined);
  }, [stored]);
  const save = async () => {
    const value = text.trim();
    if (value === stored) return;
    try {
      const result = await commit(value);
      if (result.ok) {
        setError(undefined);
        resetChessComRoute();
      } else setError(result.error);
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <TextField
        label="CORS proxy URL"
        value={text}
        onChange={setText}
        error={error}
        placeholder="https://…workers.dev"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="url"
        onBlur={() => void save()}
      />
      <p className="text-xs text-muted">
        Optional. Only used when Chess.com cannot be reached directly.{' '}
        <a className="underline" href={PROXY_GUIDE_URL} target="_blank" rel="noreferrer">
          How to set one up
        </a>
      </p>
    </div>
  );
}

function RatingFields() {
  const [source, commitSource] = useSetting<RatingSource>(CHESS_SETTING_KEYS.ratingSource);
  const [manual, commitManual] = useSetting<number>(CHESS_SETTING_KEYS.manualRating);
  const ratings = useLiveQuery(async () => (await readRatings()) ?? null, []);
  const [text, setText] = useState(String(manual));
  const [error, setError] = useState<string>();
  useEffect(() => {
    setText(String(manual));
    setError(undefined);
  }, [manual]);
  const fail = (e: unknown) => toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
  const saveManual = async () => {
    if (text.trim() === String(manual)) return;
    const n = /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
    try {
      const result = await commitManual(n);
      setError(result.ok ? undefined : result.error);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Select
        label="Rating source"
        value={source}
        options={[
          { value: 'rapid', label: 'Chess.com Rapid' },
          { value: 'manual', label: 'Manual rating' },
        ]}
        onChange={(v) => void commitSource(v).catch(fail)}
      />
      {source === 'rapid' && ratings !== undefined && ratings?.rapid === undefined ? (
        <p className="text-sm text-muted">Using manual rating: no Chess.com Rapid rating stored</p>
      ) : null}
      <NumberField label="Manual rating" value={text} onChange={setText} error={error} hint="Whole number, 100 to 3000" onBlur={() => void saveManual()} />
    </div>
  );
}

/** Chess part of the Settings_Screen (R40, R46.7, R5.2). */
export default function ChessSettingsSection() {
  return (
    <section aria-label="Chess settings" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Chess</h2>
      <UsernameField />
      <ProxyField />
      <RatingFields />
    </section>
  );
}
