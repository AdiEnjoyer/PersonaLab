import { useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { deleteSecret, maskKey, SECRET_KEYS, setSecret } from '../../../core/settings/secrets';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { toast } from '../../../ui/toast/toastStore';
import { FREE_TIER_WARNING } from '../constants';
import { readGeminiKey } from '../data/estimate';
import { useLiveValue } from '../data/live';

/** Gemini_Key entry, replace and delete; the key shows only masked with its last 4 characters (R5.7, R36.6, R36.8). */
export function GeminiKeySettings() {
  const stored = useLiveValue(async () => (await readGeminiKey()) ?? '', []);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const fail = (e: unknown) => toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
  const save = async () => {
    try {
      const result = await setSecret(SECRET_KEYS.geminiKey, text);
      if (result.ok) {
        setText('');
        setError(undefined);
      } else setError(result.error);
    } catch (e) {
      fail(e);
    }
  };
  const remove = async () => {
    try {
      await deleteSecret(SECRET_KEYS.geminiKey);
      setError(undefined);
    } catch (e) {
      fail(e);
    }
  };

  const key = stored.value;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Gemini API key</h3>
      <p aria-label="Gemini key status" className="text-sm tabular-nums">
        {stored.value === undefined && !stored.failed ? '…' : key ? maskKey(key) : 'Not set'}
      </p>
      <TextField
        label={key ? 'Replace key' : 'Gemini API key'}
        value={text}
        onChange={setText}
        error={error}
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <div className="flex gap-2">
        <Button disabled={text.trim() === ''} onClick={() => void save()}>
          Save key
        </Button>
        <Button variant="secondary" disabled={!key} onClick={() => void remove()}>
          Delete key
        </Button>
      </div>
      <p className="text-sm text-muted">{FREE_TIER_WARNING}</p>
    </div>
  );
}
