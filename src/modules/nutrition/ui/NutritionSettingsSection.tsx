import { useEffect, useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { GOALS, type Goal } from '../../../core/profile/schema';
import { useSetting } from '../../../core/settings/useSetting';
import { NumberField } from '../../../ui/form/NumberField';
import { Switch } from '../../../ui/form/Switch';
import { Button } from '../../../ui/primitives/Button';
import { toast } from '../../../ui/toast/toastStore';
import { GOAL_ADJUST_DEFAULT, PROTEIN_DEFAULT } from '../constants';
import { useLiveValue } from '../data/live';
import { readBurnOffset, setBurnOffset } from '../data/state';
import { GeminiKeySettings } from './GeminiKeySettings';
import { NUTRITION_SETTING_KEYS, type GoalAdjust, type ProteinFactorSetting, type TrainingOverride } from '../settings';

type Commit = (v: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * A text field that commits its value on blur. A rejected value keeps the stored value, keeps the typed text and
 * shows the accepted values under the field (R5.6, R30.9).
 */
function SettingField({ label, unit, stored, hint, toValue, commit }: { label: string; unit?: string; stored: string; hint?: string; toValue(text: string): unknown; commit: Commit }) {
  const [text, setText] = useState(stored);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setText(stored);
    setError(undefined);
  }, [stored]);
  const save = async () => {
    if (text === stored) {
      setError(undefined);
      return;
    }
    try {
      const result = await commit(toValue(text));
      setError(result.ok ? undefined : result.error);
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };
  return <NumberField label={label} {...(unit ? { unit } : {})} value={text} onChange={setText} error={error} {...(hint ? { hint } : {})} onBlur={() => void save()} />;
}

/** Text to number; anything that is not a plain decimal becomes NaN so the schema rejects it. */
const numberOf = (text: string): number => (/^[+-]?\d+([.]\d+)?$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

function TrainingOverrideSettings() {
  const [override, commit] = useSetting<TrainingOverride>(NUTRITION_SETTING_KEYS.trainingOverride);
  const save = async (next: TrainingOverride): Promise<{ ok: true } | { ok: false; error: string }> => commit(next);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Training hours</h3>
      <Switch
        label="Use my own weekly training hours"
        checked={override.enabled}
        onChange={(enabled) =>
          void save({ ...override, enabled }).catch((e: unknown) => toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' }))
        }
      />
      <SettingField
        label="Hours per week"
        unit="h"
        stored={String(override.hours)}
        hint="0 to 40, in steps of 0.5"
        toValue={numberOf}
        commit={(v) => save({ ...override, hours: v as number })}
      />
    </div>
  );
}

const GOAL_LABEL: Record<Goal, string> = { cut: 'Cut', maintain: 'Maintain', bulk: 'Bulk' };

function GoalSettings() {
  const [adjust, commitAdjust] = useSetting<GoalAdjust>(NUTRITION_SETTING_KEYS.goalAdjust);
  const [factor, commitFactor] = useSetting<ProteinFactorSetting>(NUTRITION_SETTING_KEYS.proteinFactor);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Calorie and protein targets</h3>
      {GOALS.map((goal) => (
        <fieldset key={goal} className="flex flex-col gap-2 rounded-continuous border border-line p-3">
          <legend className="px-1 text-sm">{GOAL_LABEL[goal]}</legend>
          <SettingField
            label={`${GOAL_LABEL[goal]} calorie adjustment`}
            unit="kcal"
            stored={String(adjust[goal])}
            hint={`−1000 to +1000, in steps of 50 (default ${GOAL_ADJUST_DEFAULT[goal]})`}
            toValue={numberOf}
            commit={(v) => commitAdjust({ ...adjust, [goal]: v })}
          />
          <SettingField
            label={`${GOAL_LABEL[goal]} protein factor`}
            unit="g/kg"
            stored={factor[goal] === 'default' ? String(PROTEIN_DEFAULT[goal]) : String(factor[goal])}
            hint={`1.6 to 2.2, in steps of 0.1 (default ${PROTEIN_DEFAULT[goal]})`}
            toValue={(text) => {
              const n = numberOf(text);
              // Typing the goal default stores "goal default", so it follows the default if that changes.
              return n === PROTEIN_DEFAULT[goal] ? 'default' : n;
            }}
            commit={(v) => commitFactor({ ...factor, [goal]: v })}
          />
        </fieldset>
      ))}
    </div>
  );
}

function BurnOffsetReset() {
  const offset = useLiveValue(readBurnOffset, []);
  const reset = async () => {
    try {
      await setBurnOffset(0);
      toast.show({ message: 'Burn offset reset to 0.' });
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Burn offset</h3>
      <p className="text-sm text-muted">
        Correction added to your estimated burn by the weight trend. Current offset: {offset.value === undefined ? '…' : `${offset.value} kcal`}.
      </p>
      <Button variant="secondary" disabled={offset.value === 0} onClick={() => void reset()}>
        Reset burn offset
      </Button>
    </div>
  );
}

/** Nutrition part of the Settings_Screen (R5.2, R30.2, R30.9, R39.11). */
export default function NutritionSettingsSection() {
  return (
    <section aria-label="Nutrition settings" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Nutrition</h2>
      <TrainingOverrideSettings />
      <GoalSettings />
      <BurnOffsetReset />
      <GeminiKeySettings />
    </section>
  );
}