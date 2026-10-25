import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Spine } from '../src/Spine/Spine';

const items = [
  { id: 'home', label: 'Acasă', icon: 'home' as const },
  { id: 'settings', label: 'Setări', icon: 'settings' as const },
];

describe('Spine', () => {
  it('renders nav items', () => {
    render(<Spine items={items} activeId="home" />);
    expect(screen.getAllByText('Acasă').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Setări').length).toBeGreaterThan(0);
  });

  it('calls onCollapsedChange when toggle clicked', async () => {
    const onCollapsedChange = vi.fn();
    render(
      <Spine
        items={items}
        activeId="home"
        isCollapsed={false}
        onCollapsedChange={onCollapsedChange}
      />,
    );
    const toggle = screen.getByRole('button', { name: /comprimă|extinde/i });
    toggle.click();
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('has no axe violations', async () => {
    const { container } = render(<Spine items={items} activeId="home" />);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
