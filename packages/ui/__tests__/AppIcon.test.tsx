import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppIcon } from '../src/AppIcon/AppIcon';

describe('AppIcon', () => {
  it('renders an img with correct src for booking', () => {
    const { container } = render(<AppIcon app="booking" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/app-icons/booking.svg');
  });

  it('uses inactive variant when muted', () => {
    const { container } = render(<AppIcon app="crm" muted />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/app-icons/crm-inactive.svg');
  });

  it('uses dark variant when dark=true', () => {
    const { container } = render(<AppIcon app="hr" dark />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/app-icons/hr-dark.svg');
  });

  it('uses inactive-dark variant when both muted and dark', () => {
    const { container } = render(<AppIcon app="finance" muted dark />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/app-icons/finance-inactive-dark.svg');
  });

  it('has aria-hidden when no title', () => {
    const { container } = render(<AppIcon app="finance" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has alt text when title provided', () => {
    const { container } = render(<AppIcon app="booking" title="Booking" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Booking');
  });

  it('accepts custom basePath', () => {
    const { container } = render(<AppIcon app="shifts" basePath="/icons/" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/icons/shifts.svg');
  });
});
