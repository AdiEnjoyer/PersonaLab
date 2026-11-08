import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { toLocalDate } from '../../../../core/time/localDate';
import { withFreshDb } from '../../../../test/helpers/db';
import type { FoodEntry, Product } from '../../types';
import BarcodeScanner from '../BarcodeScanner';
import ProductScreen from '../ProductScreen';

const engine = vi.hoisted(() => ({
  startScan: vi.fn(),
  stopAllTracks: vi.fn(),
}));
vi.mock('../scannerEngine', () => engine);

const TODAY = toLocalDate(Date.now());
const BARCODE = '3017620422003';

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nutrition/scan" element={<BarcodeScanner />} />
        <Route path="/nutrition/product/:barcode" element={<ProductScreen />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  engine.startScan.mockReset();
  engine.stopAllTracks.mockReset();
  // No test reaches the real network; a lookup in flight would be shared with later tests.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))));
  await withFreshDb(async () => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Barcode_Scanner', () => {
  it('opens the product for a valid scan, ignores an invalid check digit and stops the camera once', async () => {
    const stop = vi.fn();
    let decode: (text: string, format: string) => void = () => undefined;
    engine.startScan.mockImplementation((_video: unknown, cb: typeof decode) => {
      decode = cb;
      return Promise.resolve({ stop });
    });
    renderAt('/nutrition/scan?date=2025-03-01');
    await waitFor(() => expect(engine.startScan).toHaveBeenCalledTimes(1));
    await screen.findByLabelText('Camera preview');
    act(() => decode('3017620422004', 'EAN_13'));
    expect(screen.getByTestId('where')).toHaveTextContent('/nutrition/scan');
    expect(stop).not.toHaveBeenCalled();
    // A valid UPC-A is normalised with one leading 0 (R33.9).
    act(() => decode('036000291452', 'UPC_A'));
    act(() => decode('036000291452', 'UPC_A'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/nutrition/product/0036000291452?date=2025-03-01'));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['NotAllowedError', /Camera access was denied/, true],
    ['NotFoundError', /no usable camera/, false],
    ['NotReadableError', /in use by another app/, false],
  ])('shows the %s message with a Try again action and the barcode field', async (name, text, hasSteps) => {
    engine.startScan.mockRejectedValueOnce(Object.assign(new Error('x'), { name }));
    const user = userEvent.setup();
    renderAt('/nutrition/scan');
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/open Settings/) !== null).toBe(hasSteps);
    expect(screen.getByLabelText('Barcode')).toBeInTheDocument();
    engine.startScan.mockResolvedValueOnce({ stop: vi.fn() });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(engine.startScan).toHaveBeenCalledTimes(2));
  });

  it('reports a camera that does not start within 10 seconds and stops its tracks', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stop = vi.fn();
    let resolveStart: (h: { stop(): void }) => void = () => undefined;
    engine.startScan.mockReturnValue(new Promise((r) => (resolveStart = r)));
    renderAt('/nutrition/scan');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    expect(screen.getByText(/did not start within 10 seconds/)).toBeInTheDocument();
    expect(engine.stopAllTracks).toHaveBeenCalled();
    // A stream that arrives late is stopped at once.
    await act(async () => resolveStart({ stop }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops the camera when the app is hidden and on unmount, and restarts when visible again', async () => {
    const stops = [vi.fn(), vi.fn()];
    engine.startScan.mockImplementation(() => Promise.resolve({ stop: stops[engine.startScan.mock.calls.length - 1] }));
    const view = renderAt('/nutrition/scan');
    await waitFor(() => expect(engine.startScan).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    const setVisibility = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    act(() => setVisibility('hidden'));
    expect(stops[0]).toHaveBeenCalledTimes(1);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(engine.startScan).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    view.unmount();
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });

  it('validates a typed barcode inline and keeps the text', async () => {
    engine.startScan.mockResolvedValue({ stop: vi.fn() });
    const user = userEvent.setup();
    renderAt('/nutrition/scan');
    await user.click(await screen.findByRole('button', { name: 'Type barcode' }));
    await user.type(screen.getByLabelText('Barcode'), '3017620422004');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByText(/check digit does not match/)).toBeInTheDocument();
    expect(screen.getByLabelText('Barcode')).toHaveValue('3017620422004');
    await user.clear(screen.getByLabelText('Barcode'));
    await user.type(screen.getByLabelText('Barcode'), '3017-6204 22003');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/nutrition/product/${BARCODE}`));
  });
});

const product: Product = {
  barcode: BARCODE,
  source: 'Open Food Facts',
  name: 'Nutella',
  brand: 'Ferrero',
  kcalPer100: 539,
  proteinPer100: 6.3,
  carbsPer100: 57.5,
  servingQuantity: 15,
  fetchedAt: Date.now(),
};

describe('Product screen', () => {
  it('scales a grams or servings portion live, validates it and saves one entry with missing fat absent', async () => {
    await db.table('nutrition_products').put(product);
    const user = userEvent.setup();
    renderAt(`/nutrition/product/${BARCODE}?date=${TODAY}&slot=lunch`);
    const grams = await screen.findByLabelText(/^Grams/, undefined, { timeout: 5000 });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(grams, '0.5');
    expect(screen.getByText(/Enter grams from 1 to 5000/)).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(grams);
    await user.type(grams, '30');
    expect(screen.getByText('162 kcal')).toBeInTheDocument(); // 539 x 0.3 = 161.7
    expect(screen.getByText(/Protein 1\.9 g · Carbs 17\.3 g · Fat –/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Servings' }));
    await user.type(screen.getByLabelText(/^Servings/), '1.3');
    expect(screen.getByText(/Enter servings from 0\.25 to 20/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Servings/));
    await user.type(screen.getByLabelText(/^Servings/), '2');
    expect(screen.getByText('162 kcal')).toBeInTheDocument();
    await user.dblClick(save);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/nutrition'));
    const entries = await db.table<FoodEntry>('nutrition_foodEntries').toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Nutella', source: 'barcode', barcode: BARCODE, grams: 30, slot: 'lunch', date: TODAY });
    expect(entries[0]!.kcal).toBeCloseTo(161.7, 9);
    expect(entries[0]).not.toHaveProperty('fat');
  });

  it('shows only the grams input when the product has no serving size', async () => {
    await db.table('nutrition_products').put({ ...product, servingQuantity: undefined });
    renderAt(`/nutrition/product/${BARCODE}`);
    await screen.findByLabelText(/^Grams/, undefined, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: 'Servings' })).not.toBeInTheDocument();
  });

  it('shows the manual form with a Retry message when the lookup fails, then the portion screen after saving', async () => {
    {
      const user = userEvent.setup();
      renderAt(`/nutrition/product/${BARCODE}`);
      expect(await screen.findByText('The product lookup failed.', undefined, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.getByText(`Barcode ${BARCODE}`)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save product' }));
      expect(screen.getAllByText(/Enter/).length).toBeGreaterThan(0);
      expect(await db.table('nutrition_products').count()).toBe(0);
      await user.type(screen.getByLabelText('Name'), 'Home bread');
      await user.type(screen.getByLabelText(/^Energy per 100 g/), '250');
      await user.click(screen.getByRole('button', { name: 'Save product' }));
      expect(await screen.findByText('Log product', undefined, { timeout: 5000 })).toBeInTheDocument();
      expect(await db.table<Product>('nutrition_products').get(BARCODE)).toMatchObject({ source: 'manual', name: 'Home bread', kcalPer100: 250 });
    }
  });

  it('says a malformed barcode is not supported', async () => {
    renderAt('/nutrition/product/12ab');
    expect(await screen.findByText('Not a supported product barcode')).toBeInTheDocument();
  });
});
