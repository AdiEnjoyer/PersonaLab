import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { getProfile } from '../../core/profile/repo';
import { withFreshDb } from '../../test/helpers/db';
import { FirstRunProfile } from '../FirstRunProfile';

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('FirstRunProfile', () => {
  it('keeps the entered values and stores nothing when a field is invalid', async () => {
    const user = userEvent.setup();
    render(<FirstRunProfile />);
    await user.type(screen.getByLabelText(/^Age/), '30');
    await user.selectOptions(screen.getByLabelText('Sex'), 'female');
    await user.type(screen.getByLabelText(/^Height/), '170');
    await user.type(screen.getByLabelText(/^Weight/), '70,25'); // two decimals: off the 0.1 step
    await user.type(screen.getByLabelText(/^Weekly training hours/), '4');
    await user.selectOptions(screen.getByLabelText('Goal'), 'cut');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByText(/steps of 0.1 kg/, { selector: 'p[role="alert"]' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue('30');
    expect(screen.getByLabelText(/^Weight/)).toHaveValue('70.25');
    expect(screen.getByLabelText('Sex')).toHaveValue('female');
    expect(await getProfile()).toBeNull();
  });

  it('stores the Profile once every field is valid', async () => {
    const user = userEvent.setup();
    render(<FirstRunProfile />);
    await user.type(screen.getByLabelText(/^Age/), '30');
    await user.selectOptions(screen.getByLabelText('Sex'), 'male');
    await user.type(screen.getByLabelText(/^Height/), '180');
    await user.type(screen.getByLabelText(/^Weight/), '80,5');
    await user.type(screen.getByLabelText(/^Weekly training hours/), '4.5');
    await user.selectOptions(screen.getByLabelText('Goal'), 'bulk');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await expect.poll(() => getProfile()).toMatchObject({ age: 30, weightKg: 80.5, goal: 'bulk' });
  });
});
