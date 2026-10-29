import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Menu } from '../src/Menu/Menu';
import { Button } from '../src/Button/Button';

const items = [
  { id: 'edit', label: 'Editează' },
  { id: 'delete', label: 'Șterge', isDanger: true },
];

describe('Menu', () => {
  it('renders trigger button', () => {
    render(
      <Menu items={items} onAction={vi.fn()}>
        <Button>Acțiuni</Button>
      </Menu>,
    );
    expect(screen.getByRole('button', { name: 'Acțiuni' })).toBeDefined();
  });

  it('opens menu on click', async () => {
    const user = userEvent.setup();
    render(
      <Menu items={items} onAction={vi.fn()}>
        <Button>Acțiuni</Button>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Acțiuni' }));
    expect(screen.getByRole('menuitem', { name: 'Editează' })).toBeDefined();
  });

  it('calls onAction when item selected', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Menu items={items} onAction={onAction}>
        <Button>Acțiuni</Button>
      </Menu>,
    );
    await user.click(screen.getByRole('button', { name: 'Acțiuni' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editează' }));
    expect(onAction).toHaveBeenCalledWith('edit');
  });

  it('has no axe violations on trigger', async () => {
    const { container } = render(
      <Menu items={items}>
        <Button>Acțiuni</Button>
      </Menu>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });

  it('popover-ul preia data-theme al strămoșului (ca Select)', async () => {
    const user = userEvent.setup();
    render(
      <div data-theme="dark">
        <Menu items={items} onAction={vi.fn()}>
          <Button>Acțiuni</Button>
        </Menu>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Acțiuni' }));
    const menu = screen.getByRole('menu');
    expect(menu.closest('[data-theme]')?.getAttribute('data-theme')).toBe('dark');
    expect(menu.closest('.v-portal-theme')).not.toBeNull();
  });
});

describe('Menu — ca în bundle', () => {
  it('defaultOpen, titlu, bifă (menuitemcheckbox), separator, element dezactivat', () => {
    render(
      <Menu
        label="Acțiuni programare"
        defaultOpen
        items={[
          { heading: 'Programare' },
          { id: 'edit', label: 'Editează', icon: 'pencil', shortcut: ['E'] },
          { id: 'cancelled', label: 'Arată și anulate', checked: true },
          { id: 'export', label: 'Exportă', isDisabled: true },
          { separator: true },
          { id: 'del', label: 'Anulează', isDanger: true },
        ]}
      >
        <Button>Acțiuni</Button>
      </Menu>,
    );
    const menu = screen.getByRole('menu', { name: 'Acțiuni programare' });
    expect(menu).toBeDefined();
    expect(screen.getByText('Programare')).toBeDefined();
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Arată și anulate' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Exportă' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Acțiuni' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});
