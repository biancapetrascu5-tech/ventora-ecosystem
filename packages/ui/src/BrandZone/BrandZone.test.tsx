import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrandZone } from './BrandZone';

describe('BrandZone', () => {
  it('renders children', () => {
    render(<BrandZone>Hello</BrandZone>);
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('sets data-brand attribute', () => {
    const { container } = render(<BrandZone>content</BrandZone>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.hasAttribute('data-brand')).toBe(true);
  });

  it('renders as a custom element', () => {
    const { container } = render(<BrandZone as="aside">panel</BrandZone>);
    expect(container.querySelector('aside')).toBeTruthy();
  });

  it('forwards className and other props', () => {
    const { container } = render(
      <BrandZone className="extra" aria-label="brand zone">
        x
      </BrandZone>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.classList.contains('extra')).toBe(true);
    expect(el.getAttribute('aria-label')).toBe('brand zone');
  });
});
