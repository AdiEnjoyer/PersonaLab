import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { SECRET_KEYS, setSecret } from '../../../../core/settings/secrets';
import { toLocalDate } from '../../../../core/time/localDate';
import { installWriteFailures, withFreshDb, type WriteFailures } from '../../../../test/helpers/db';
import { toast } from '../../../../ui/toast/toastStore';
import { GEMINI_MODEL_ID } from '../../constants';
import { setAiWarningAck } from '../../data/estimate';
import type { FoodEntry } from '../../types';
import { GeminiKeySettings } from '../GeminiKeySettings';
import MealEstimator from '../MealEstimator';

const KEY = 'AIzaSyTestKey-1234567890abcdefWXYZ';

const image = vi.hoisted(() => ({
  processImage: vi.fn(async (_file: Blob, o: { maxSide: number }) => ({
    bytes: new Uint8Array([1, 2, 3, o.maxSide % 256]).buffer,
    mime: 'image/jpeg' as const,
    width: o.maxSide,
    height: 10,
    blurhash: `hash${o.maxSide}`,
  })),
}));
vi.mock('../../../../core/image/processImage', async (importOriginal) => ({ ...(await importOriginal<object>()), processImage: image.processImage }));

const TODAY = toLocalDate(Date.now());
const ANSWER = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              items: [
                { name: 'Rice', grams: 200, kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 1 },
                { name: 'Chicken', grams: 100, kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
              ],
              confidence: 'low',
            }),
          },
        ],
      },
    },
  ],
};
const ok = (body: unknown = ANSWER) => new Response(JSON.stringify(body), { status: 200 });

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function renderEstimator() {
  return render(
    <MemoryRouter initialEntries={['/nutrition/estimate']}>
      <Routes>
        <Route path="/nutrition/estimate" element={<MealEstimator />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const entries = () => db.table<FoodEntry>('nutrition_foodEntries').toArray();
const pickPhoto = (user: ReturnType<typeof userEvent.setup>) => user.upload(screen.getByLabelText('Library photo'), new File(['x'], 'meal.jpg', { type: 'image/jpeg' }));

const failures: WriteFailures = installWriteFailures(db);
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  image.processImage.mockClear();
  failures.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await withFreshDb(async () => undefined);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('Meal_Estimator', () => {
  it('goes from photo through the warning to the review and saves one entry per item with a shared thumbnail', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    fetchMock.mockResolvedValue(ok());
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    expect(image.processImage).toHaveBeenCalledWith(expect.anything(), { maxSide: 1024, quality: 0.8 });
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    // No request while the warning is open.
    await user.click(await screen.findByRole('button', { name: 'I understand' }));
    await screen.findByText('Review estimate');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(String(init.body)).not.toContain(KEY);

    expect(screen.getByRole('status')).toHaveTextContent('check the values');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Grams edit rescales the other numbers; totals follow.
    const grams = screen.getAllByLabelText(/^Grams/)[0]!;
    await user.clear(grams);
    await user.type(grams, '100');
    expect(screen.getAllByLabelText(/^Energy/)[0]).toHaveValue('130');
    expect(screen.getByLabelText('Meal totals')).toHaveTextContent('295 kcal');
    await user.selectOptions(screen.getByLabelText('Meal'), 'lunch');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/nutrition'));
    const saved = await entries();
    expect(saved.map((e) => e.name).sort()).toEqual(['Chicken', 'Rice']);
    const rice = saved.find((e) => e.name === 'Rice')!;
    expect(rice).toMatchObject({ source: 'ai', confidence: 'low', slot: 'lunch', date: TODAY, grams: 100, kcal: 130 });
    expect(new Set(saved.map((e) => e.thumbnail?.imageId)).size).toBe(1);
    expect(rice.thumbnail).toMatchObject({ blurhash: 'hash256' });
    expect(await db.table('nutrition_images').count()).toBe(1);
    // The acknowledgement is stored: the next estimate shows no warning.
    expect(await db.table('nutrition_state').get('aiWarningAck')).toBeDefined();
  });

  it('keeps the review after a failed save and creates each entry once on retry', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await setAiWarningAck();
    fetchMock.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ name: 'Egg', grams: 50, kcal: 72, protein_g: 6, carbs_g: 0.4, fat_g: 5 }], confidence: 'high' }) }] } }] }));
    const toastShow = vi.spyOn(toast, 'show');
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    await screen.findByText('Review estimate');
    await user.selectOptions(screen.getByLabelText('Meal'), 'breakfast');
    failures.failNext('nutrition_foodEntries', () => new Error('boom'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastShow).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })));
    expect(screen.getByText('Review estimate')).toBeInTheDocument();
    expect(await entries()).toHaveLength(0);
    expect(await db.table('nutrition_images').count()).toBe(0);
    await user.dblClick(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/nutrition'));
    expect(await entries()).toHaveLength(1);
    expect(await db.table('nutrition_images').count()).toBe(1);
  });

  it('shows "rejected" for HTTP 401 without Retry and never shows the key', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await setAiWarningAck();
    fetchMock.mockResolvedValue(new Response(`{"error":"bad key ${KEY}"}`, { status: 401 }));
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    expect(await screen.findByText('Your Gemini API key was rejected. Check it in Settings.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(KEY);
  });

  it.each([
    [429, 'Free-tier limit reached. Try again later.'],
    [503, 'The AI service did not respond.'],
  ])('shows the message for HTTP %i with Retry, which resends the same photo', async (status, text) => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await setAiWarningAck();
    fetchMock.mockResolvedValueOnce(new Response('', { status }));
    fetchMock.mockResolvedValueOnce(ok());
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Review estimate');
    expect(image.processImage).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].body).toBe((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
  });

  it('offers Retry and "Enter manually" for an unusable answer', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await setAiWarningAck();
    fetchMock.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: '{"items":[],"confidence":"high"}' }] } }] }));
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    expect(await screen.findByText('The AI returned an unusable answer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter manually' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/nutrition/add?date=${TODAY}`));
    expect(await entries()).toHaveLength(0);
  });

  it('aborts on Cancel, shows no error, creates nothing and keeps the photo', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await setAiWarningAck();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estimate' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Estimate' })).toBeEnabled();
    expect(await entries()).toHaveLength(0);
  });

  it('treats a request that exceeds 45 seconds as a service error', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await setAiWarningAck();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await user.click(await screen.findByRole('button', { name: 'Estimate' }));
      await screen.findByRole('button', { name: 'Cancel' });
      await vi.advanceTimersByTimeAsync(45_000);
    } finally {
      vi.useRealTimers();
    }
    expect(await screen.findByText('The AI service did not respond.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('checks the key before the offline state, sends nothing, and keeps the photo', async () => {
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    expect(await screen.findByText('Add your Gemini API key in Settings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument();
    expect(screen.queryByText(/You are offline/)).toBeNull();

    await setSecret(SECRET_KEYS.geminiKey, KEY);
    await user.click(screen.getByRole('button', { name: 'Estimate' }));
    expect(await screen.findByText('You are offline. AI estimates need a connection.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Estimate' })).toBeEnabled();
  });

  it('sends nothing and stores no acknowledgement when the warning is cancelled', async () => {
    await setSecret(SECRET_KEYS.geminiKey, KEY);
    const user = userEvent.setup();
    renderEstimator();
    await pickPhoto(user);
    await user.click(await screen.findByRole('button', { name: 'Estimate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.table('nutrition_state').get('aiWarningAck')).toBeUndefined();
  });
});

describe('Gemini key settings', () => {
  it('shows Not set, stores the key masked with its last 4 characters, and deletes it', async () => {
    const user = userEvent.setup();
    render(<GeminiKeySettings />);
    await waitFor(() => expect(screen.getByLabelText('Gemini key status')).toHaveTextContent('Not set'));
    expect(screen.getByText(/may use data sent through the Gemini free tier/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Gemini API key', { selector: 'input' }), KEY);
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(screen.getByLabelText('Gemini key status')).toHaveTextContent(KEY.slice(-4)));
    expect(document.body.textContent).not.toContain(KEY);
    expect(screen.getByText(/may use data sent through the Gemini free tier/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete key' }));
    await waitFor(() => expect(screen.getByLabelText('Gemini key status')).toHaveTextContent('Not set'));
  });
});
