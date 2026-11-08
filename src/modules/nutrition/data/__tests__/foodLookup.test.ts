import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { OFF } from '../../constants';
import type { Product } from '../../types';
import { lookupProduct, offUrl, readProduct, saveManualProduct } from '../foodLookup';

const BARCODE = '3017620422003';
const NOW = Date.UTC(2025, 5, 1);
const offBody = (product: Record<string, unknown>) => ({ status: 1, product });
const nutella = offBody({ product_name: 'Nutella', brands: 'Ferrero', serving_quantity: '15', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } });
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const table = () => db.table<Product, string>('nutrition_products');

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('Food_Lookup', () => {
  it('requests only the declared fields, maps nutrients from nutriments and caches the product', async () => {
    const fetchImpl = vi.fn(() => json(nutella));
    const result = await lookupProduct(BARCODE, { online: true, fetchImpl, now: () => NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]).toEqual([offUrl(BARCODE), expect.objectContaining({ credentials: 'omit' })]);
    expect(offUrl(BARCODE)).toContain(`fields=${OFF.FIELDS.join(',')}`);
    expect(result).toMatchObject({ kind: 'product', product: { name: 'Nutella', kcalPer100: 539, servingQuantity: 15, source: 'Open Food Facts', fetchedAt: NOW } });
    expect(await table().count()).toBe(1);
  });

  it('shows a cached product with no request, and revalidates an Open Food Facts record older than 30 days silently', async () => {
    await table().put({ barcode: BARCODE, source: 'Open Food Facts', name: 'Old', kcalPer100: 100, fetchedAt: NOW - OFF.STALE_MS - 1 });
    const fresh = vi.fn(() => json(offBody({ product_name: 'New', nutriments: { 'energy-kcal_100g': 200 } })));
    const updates: Product[] = [];
    const first = await lookupProduct(BARCODE, { online: true, fetchImpl: fresh, now: () => NOW, onRevalidated: (p) => updates.push(p) });
    expect(first).toMatchObject({ kind: 'product', product: { name: 'Old' } });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ name: 'New', kcalPer100: 200, fetchedAt: NOW });
    expect(await table().count()).toBe(1);

    const unused = vi.fn(() => json(nutella));
    await lookupProduct(BARCODE, { online: true, fetchImpl: unused, now: () => NOW + 1000 });
    expect(unused).not.toHaveBeenCalled();
  });

  it('keeps the cached record when revalidation fails or lacks kcal', async () => {
    const old: Product = { barcode: BARCODE, source: 'Open Food Facts', name: 'Old', kcalPer100: 100, fetchedAt: 1 };
    await table().put(old);
    const failing = vi.fn(() => Promise.reject(new TypeError('network')));
    await lookupProduct(BARCODE, { online: true, fetchImpl: failing, now: () => NOW });
    await vi.waitFor(() => expect(failing).toHaveBeenCalled());
    const noKcal = vi.fn(() => json(offBody({ product_name: 'X' })));
    await lookupProduct(BARCODE, { online: true, fetchImpl: noKcal, now: () => NOW });
    await vi.waitFor(() => expect(noKcal).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(await readProduct(BARCODE)).toEqual(old);
  });

  it('never requests or overwrites a manual record', async () => {
    await saveManualProduct(BARCODE, { name: 'Mine', kcalPer100: 50 }, 1);
    const fetchImpl = vi.fn(() => json(nutella));
    const result = await lookupProduct(BARCODE, { online: true, fetchImpl, now: () => NOW });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: 'product', product: { source: 'manual', name: 'Mine' } });
  });

  it('opens the manual form with the barcode for not found, missing kcal, offline, failed, unreadable and timeout; nothing is cached except an incomplete product', async () => {
    expect(await lookupProduct(BARCODE, { online: true, fetchImpl: () => json({ status: 0 }, 404) })).toEqual({ kind: 'manual', fields: {} });
    expect(await lookupProduct(BARCODE, { online: false, fetchImpl: vi.fn() })).toEqual({ kind: 'manual', fields: {}, notice: 'offline' });
    expect(await lookupProduct(BARCODE, { online: true, fetchImpl: () => Promise.reject(new TypeError('x')) })).toMatchObject({ notice: 'failed' });
    expect(await lookupProduct(BARCODE, { online: true, fetchImpl: () => json('nonsense') })).toMatchObject({ notice: 'unreadable' });
    expect(await lookupProduct(BARCODE, { online: true, fetchImpl: () => json({}, 500) })).toMatchObject({ notice: 'failed' });
    expect(await table().count()).toBe(0);
    const late = () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(nutella))), 200));
    expect(await lookupProduct(BARCODE, { online: true, fetchImpl: late, timeoutMs: 20 })).toMatchObject({ kind: 'manual', notice: 'timeout' });
    await new Promise((r) => setTimeout(r, 250));
    expect(await table().count()).toBe(0);
    const incomplete = await lookupProduct(BARCODE, { online: true, fetchImpl: () => json(offBody({ product_name: 'No energy', nutriments: { proteins_100g: 3 } })) });
    expect(incomplete).toEqual({ kind: 'manual', fields: { name: 'No energy', proteinPer100: 3 } });
  });

  it('rejects unsupported barcodes without a request or a write', async () => {
    const fetchImpl = vi.fn();
    expect(await lookupProduct('123', { online: true, fetchImpl })).toEqual({ kind: 'invalid' });
    expect(await lookupProduct('12345678901234a', { online: true, fetchImpl })).toEqual({ kind: 'invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await table().count()).toBe(0);
  });

  it('a manual save replaces an Open Food Facts record', async () => {
    await table().put({ barcode: BARCODE, source: 'Open Food Facts', name: 'OFF', kcalPer100: 1, fetchedAt: 1 });
    await saveManualProduct(BARCODE, { name: 'Mine', kcalPer100: 2 }, 5);
    expect(await readProduct(BARCODE)).toEqual({ barcode: BARCODE, source: 'manual', name: 'Mine', kcalPer100: 2, fetchedAt: 5 });
  });
});
