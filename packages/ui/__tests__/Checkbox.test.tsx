import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Checkbox } from '../src/Checkbox/Checkbox';

describe('Checkbox', () => {
  it('renders with label', () => {
    render(<Checkbox>Acceptă termenii</Checkbox>);
    expect(screen.getByRole('checkbox', { name: 'Acceptă termenii' })).toBeDefined();
  });

  it('toggles when clicked', async () => {
    const user = userEvent.setup();
    let value = false;
    render(<Checkbox onChange={(v) => { value = v; }}>Check</Checkbox>);
    await user.click(screen.getByRole('checkbox'));
    expect(value).toBe(true);
  });

  it('is disabled when isDisabled=true', () => {
    render(<Checkbox isDisabled>Disabled</Checkbox>);
    expect(screen.getByRole('checkbox').getAttribute('disabled')).not.toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Checkbox>Acceptă termenii</Checkbox>);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
