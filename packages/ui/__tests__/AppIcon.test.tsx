import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppIcon } from '../src/AppIcon/AppIcon';

describe('AppIcon', () => {
  it('desenează SVG-ul aplicației: placa, marginea și glifa', () => {
    const { container } = render(<AppIcon app="booking" size={32} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('viewBox')).toBe('0 0 48 48');
    expect(svg.querySelector('.v-ag-plate')).toBeTruthy();
    expect(svg.querySelector('.v-ag-edge')).toBeTruthy();
    expect(svg.querySelector('.v-ag-a')).toBeTruthy();
  });

  it('muted adaugă starea estompată', () => {
    const a = render(<AppIcon app="crm" />)
      .container.querySelector('svg')!
      .getAttribute('class');
    const b = render(<AppIcon app="crm" muted />)
      .container.querySelector('svg')!
      .getAttribute('class');
    expect(a).not.toBe(b);
  });

  it('aplicație fără glifă: iconița Lucide pe placă', () => {
    const { container } = render(<AppIcon app="necunoscută" icon="store" size={40} />);
    const span = container.querySelector('span')!;
    expect(span.style.width).toBe('40px');
    expect(span.querySelector('svg')).toBeTruthy();
  });

  it('decorativă fără title; cu title are rol img și nume', () => {
    expect(
      render(<AppIcon app="finance" />)
        .container.querySelector('svg')!
        .getAttribute('aria-hidden'),
    ).toBe('true');
    const svg = render(<AppIcon app="booking" title="EasyBook" />).container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('EasyBook');
  });
});
