import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withFreshDb } from '../../test/helpers/db';
import { HomeDashboard } from '../HomeDashboard';

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

function Broken(): never {
  throw new Error('card exploded');
}

describe('HomeDashboard', () => {
  it('shows a placeholder for a failing card and still renders the others in order', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <HomeDashboard
        modules={[
          { id: 'aaa', name: 'Alpha', DashboardCard: () => <p>Alpha card</p> },
          { id: 'bbb', name: 'Broken', DashboardCard: Broken },
          { id: 'ccc', name: 'Gamma', DashboardCard: () => <p>Gamma card</p> },
        ]}
      />,
    );
    expect(screen.getByText('Broken failed to load')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Alpha card')).toBeLessThan(text.indexOf('Broken failed to load'));
    expect(text.indexOf('Broken failed to load')).toBeLessThan(text.indexOf('Gamma card'));
  });
});
