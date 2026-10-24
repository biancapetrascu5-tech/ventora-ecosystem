import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Toggle } from '../src/Toggle/Toggle';

describe('Toggle', () => {
  it('renders with label', () => {
    render(<Toggle>Notificări</Toggle>);
    expect(screen.getByRole('switch', { name: 'Notificări' })).toBeDefined();
  });

  it('toggles when clicked', async () => {
    const user = userEvent.setup();
    let value = false;
    render(
      <Toggle
        onChange={(v) => {
          value = v;
        }}
      >
        Toggle
      </Toggle>,
    );
    await user.click(screen.getByRole('switch'));
    expect(value).toBe(true);
  });

  it('is disabled when isDisabled=true', () => {
    render(<Toggle isDisabled>Disabled</Toggle>);
    expect(screen.getByRole('switch').getAttribute('disabled')).not.toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Toggle>Notificări email</Toggle>);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
