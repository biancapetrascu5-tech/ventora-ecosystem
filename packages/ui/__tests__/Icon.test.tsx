import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Icon } from '../src/Icon/Icon';
import { Check } from 'lucide-react';

describe('Icon', () => {
  it('renders hidden icon by default', () => {
    const { container } = render(<Icon icon={Check} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders labeled icon with aria-label', () => {
    render(<Icon icon={Check} label="Confirmat" />);
    expect(screen.getByLabelText('Confirmat')).toBeDefined();
  });

  it('has no axe violations when labeled', async () => {
    const { container } = render(<Icon icon={Check} label="Confirmat" />);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
