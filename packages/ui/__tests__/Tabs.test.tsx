import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Tabs } from '../src/Tabs/Tabs';

const items = [
  { id: 'tab1', label: 'General', children: <div>Conținut General</div> },
  { id: 'tab2', label: 'Securitate', children: <div>Conținut Securitate</div> },
  { id: 'tab3', label: 'Dezactivat', children: <div>Niciodată</div>, isDisabled: true },
];

describe('Tabs', () => {
  it('renders all tab labels', () => {
    render(<Tabs items={items} />);
    expect(screen.getByRole('tab', { name: 'General' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Securitate' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Dezactivat' })).toBeDefined();
  });

  it('shows first panel by default', () => {
    render(<Tabs items={items} />);
    expect(screen.getByText('Conținut General')).toBeDefined();
  });

  it('switches panel on click', async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} />);
    await user.click(screen.getByRole('tab', { name: 'Securitate' }));
    expect(screen.getByText('Conținut Securitate')).toBeDefined();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Tabs items={items} />);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
