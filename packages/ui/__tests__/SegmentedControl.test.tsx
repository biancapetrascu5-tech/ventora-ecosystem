import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { SegmentedControl } from '../src/SegmentedControl/SegmentedControl';

const options = [
  { value: 'list', label: 'Listă' },
  { value: 'grid', label: 'Grilă' },
  { value: 'map', label: 'Hartă' },
];

describe('SegmentedControl', () => {
  it('renders all options', () => {
    render(<SegmentedControl aria-label="Vizualizare" options={options} />);
    expect(screen.getByRole('radio', { name: 'Listă' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Grilă' })).toBeDefined();
  });

  it('calls onChange when option clicked', async () => {
    const user = userEvent.setup();
    let selected = '';
    render(
      <SegmentedControl
        aria-label="Vizualizare"
        options={options}
        onChange={(v) => {
          selected = v;
        }}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Grilă' }));
    expect(selected).toBe('grid');
  });

  it('has no axe violations', async () => {
    const { container } = render(<SegmentedControl aria-label="Vizualizare" options={options} />);
    const results = await axe.run(container, {
      rules: {
        // RAC Tabs renders tablist without tabpanel in standalone use — by design
        'aria-required-children': { enabled: false },
        // jsdom cannot compute contrast (no canvas)
        'color-contrast': { enabled: false },
      },
    });
    expect(results.violations).toHaveLength(0);
  });
});
