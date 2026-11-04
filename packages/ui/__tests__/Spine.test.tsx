import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { Spine } from '../src/Spine/Spine';

const labels = {
  backToHub: 'Înapoi la aplicații',
  expandMenu: 'Extinde meniul',
  collapseMenu: 'Restrânge meniul',
  more: 'Mai multe',
};

const sections = [
  {
    items: [
      { id: 'home', label: 'Acasă', icon: 'home' as const },
      { id: 'list', label: 'Programări', icon: 'list' as const, badge: 3 },
    ],
  },
  { label: 'Afacere', items: [{ id: 'settings', label: 'Setări', icon: 'settings' as const }] },
];

describe('Spine', () => {
  it('arată aplicația, secțiunile și insigna', () => {
    render(<Spine appName="EasyBook" labels={labels} sections={sections} activeId="list" />);
    const [side] = screen.getAllByRole('navigation', { name: 'EasyBook' });
    expect(within(side!).getByText('Afacere')).toBeDefined();
    expect(within(side!).getByText('3')).toBeDefined();
    expect(
      within(side!)
        .getByRole('button', { name: /Programări/ })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('uses the short label only in the bottom nav (S70)', () => {
    render(
      <Spine
        appName="EasyBook"
        labels={labels}
        items={[{ id: 'bookings', label: 'Appuntamenti', short: 'Agenda', icon: 'calendar' }]}
      />,
    );
    const [side, bottom] = screen.getAllByRole('navigation', { name: 'EasyBook' });
    expect(within(bottom!).getByText('Agenda')).toBeDefined();
    expect(within(bottom!).queryByText('Appuntamenti')).toBeNull();
    expect(within(side!).getByText('Appuntamenti')).toBeDefined();
  });

  it('calls onCollapsedChange when toggle clicked', () => {
    const onCollapsedChange = vi.fn();
    render(
      <Spine
        appName="EasyBook"
        labels={labels}
        sections={sections}
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
      />,
    );
    screen.getByRole('button', { name: 'Restrânge meniul' }).click();
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  // Spine 1.2.0 (S118): controlul e jos, după listă, nu în antet; restrâns, „Extinde meniul”.
  it('puts the collapse control at the bottom, named „Extinde meniul” when collapsed', () => {
    const { container, rerender } = render(
      <Spine appName="EasyBook" labels={labels} sections={sections} collapsed={false} />,
    );
    const nav = container.querySelector('[data-spine]')!;
    const toggle = within(nav as HTMLElement).getByRole('button', { name: 'Restrânge meniul' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.hasAttribute('title')).toBe(false);
    expect(nav.lastElementChild!.contains(toggle)).toBe(true);
    expect(nav.firstElementChild!.contains(toggle)).toBe(false);
    rerender(<Spine appName="EasyBook" labels={labels} sections={sections} collapsed />);
    const collapsed = within(nav as HTMLElement).getByRole('button', { name: 'Extinde meniul' });
    expect(collapsed.getAttribute('title')).toBe('Extinde meniul');
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Spine appName="EasyBook" labels={labels} sections={sections} activeId="home" />,
    );
    // Spine are două nav cu numele aplicației (lateral și bara de jos, ca în bundle.js); în
    // browser una e mereu display: none, dar jsdom nu aplică CSS-ul modulelor.
    const results = await axe.run(container, { rules: { 'landmark-unique': { enabled: false } } });
    expect(results.violations).toHaveLength(0);
  });
});
