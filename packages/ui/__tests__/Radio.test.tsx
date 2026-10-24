import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Radio, RadioGroup } from '../src/Radio/Radio';

describe('RadioGroup', () => {
  it('renders options', () => {
    render(
      <RadioGroup label="Mărime">
        <Radio value="sm">Mic</Radio>
        <Radio value="md">Mediu</Radio>
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Mic' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Mediu' })).toBeDefined();
  });

  it('calls onChange when selection changes', async () => {
    const user = userEvent.setup();
    let selected = '';
    render(
      <RadioGroup
        label="Mărime"
        onChange={(v) => {
          selected = v;
        }}
      >
        <Radio value="sm">Mic</Radio>
        <Radio value="md">Mediu</Radio>
      </RadioGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'Mic' }));
    expect(selected).toBe('sm');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <RadioGroup label="Mărime">
        <Radio value="sm">Mic</Radio>
        <Radio value="md">Mediu</Radio>
      </RadioGroup>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
