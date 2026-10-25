import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppDock } from './AppDock';
import type { DockApp } from './AppDock';

const APPS: DockApp[] = [
  { app: 'booking', description: 'Programări' },
  { app: 'crm', description: 'Clienți', badge: 2 },
  { app: 'hr', description: 'Echipă', live: { text: '1 cerere', attention: true } },
];

describe('AppDock', () => {
  it('renders all apps', () => {
    const onOpen = vi.fn();
    render(<AppDock apps={APPS} onOpen={onOpen} />);
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('has accessible label', () => {
    const onOpen = vi.fn();
    render(<AppDock apps={APPS} onOpen={onOpen} label="Apps" />);
    expect(screen.getByRole('list', { name: 'Apps' })).toBeTruthy();
  });

  it('calls onOpen when app button is clicked', () => {
    const onOpen = vi.fn();
    render(<AppDock apps={APPS} onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: 'Booking' });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][1]).toBe('booking');
  });

  it('shows badge count', () => {
    const onOpen = vi.fn();
    render(<AppDock apps={APPS} onOpen={onOpen} />);
    expect(screen.getByLabelText('2 notificări')).toBeTruthy();
  });
});
