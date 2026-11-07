import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MODULES } from '../modules';
import { validateRegistry } from '../validate';

describe('Module_Registry', () => {
  it('contains exactly gym, nutrition and chess, in that order', () => {
    expect(MODULES.map((m) => m.id)).toEqual(['gym', 'nutrition', 'chess']);
    expect(MODULES.map((m) => m.name)).toEqual(['Gym', 'Nutrition', 'Chess']);
  });

  it('passes validateRegistry', () => {
    expect(validateRegistry(MODULES)).toEqual([]);
  });

  it('gives every module exactly one tab-root route under its own path', () => {
    for (const mod of MODULES) {
      const roots = mod.routes.filter((r) => r.tabRoot === true);
      expect(roots.map((r) => r.path)).toEqual([`/${mod.id}`]);
    }
  });

  it('declares the version 1 tables of the design', () => {
    expect(Object.fromEntries(MODULES.map((m) => [m.id, m.tables]))).toEqual({
      gym: {
        customExercises: '&id, &idemKey',
        libraryState: '&id',
        images: '&id',
        routines: '&id, &idemKey, createdAt',
        sessions: '&id, status, startedAt, finishedAt',
      },
      nutrition: {
        foodEntries: '&id, &idemKey, date, createdAt',
        savedMeals: '&id, &idemKey',
        dayMarks: '&date',
        products: '&barcode',
        weights: '&id, &idemKey, &date',
        images: '&id',
        state: '&key',
      },
      chess: {
        games: '&id, endTime, syncedFor',
        syncState: '&username',
        ratings: '&id',
        puzzleAttempts: '&id, &idemKey, puzzleId, ts',
        puzzleRating: '&id',
        trees: '&id, colour, createdAt',
        srs: '&posKey, due',
        reviews: '&id, posKey, date',
        tipState: '&id',
        evals: '&[gameId+depth+version+ply], gameId',
        reports: '&gameId',
      },
    });
  });

  it('exports data that its own backup schema accepts, at data version 1', async () => {
    for (const mod of MODULES) {
      const data = await mod.exportData();
      expect(mod.backup.dataVersion).toBe(1);
      const parsed = mod.backup.schema.parse(data);
      expect(mod.backup.sections(parsed).flatMap((s) => s.records)).toEqual([]);
      await expect(mod.importData(parsed)).resolves.toBeUndefined();
    }
  });

  it('renders each placeholder icon, screen and card', () => {
    for (const mod of MODULES) {
      const route = mod.routes[0]!;
      const { container, unmount } = render(
        createElement('div', null, createElement(mod.icon, { className: 'icon' }), createElement(route.Component), createElement(mod.DashboardCard)),
      );
      expect(container.querySelector('svg.icon')).not.toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: mod.name })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: mod.name })).toBeInTheDocument();
      unmount();
    }
  });
});
