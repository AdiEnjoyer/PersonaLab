import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LICENCES } from '../../core/about/licences';
import { withFreshDb } from '../../test/helpers/db';
import { SettingsScreen } from '../SettingsScreen';

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('SettingsScreen', () => {
  it('orders Profile, Backup, module sections, About and lists all six projects with their licences', () => {
    render(<SettingsScreen />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Profile', 'Backup', 'Gym', 'Nutrition', 'Chess', 'About']);
    expect(LICENCES.map((l) => `${l.name}:${l.licence}`)).toEqual([
      'free-exercise-db:Unlicense',
      'Lichess puzzle database:CC0',
      'Open Food Facts:ODbL',
      'Stockfish:GPLv3',
      'chess.js:BSD-2-Clause',
      'react-chessboard:MIT',
    ]);
    for (const l of LICENCES) expect(screen.getByRole('link', { name: l.name })).toHaveAttribute('href', l.url);
    expect(screen.getByRole('link', { name: 'Source code' })).toBeInTheDocument();
  });
});
