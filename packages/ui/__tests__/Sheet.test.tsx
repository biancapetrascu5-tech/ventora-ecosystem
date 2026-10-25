import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Sheet, SheetSection } from '../src/Sheet/Sheet';

describe('Sheet', () => {
  it('renders children', () => {
    render(
      <Sheet>
        <SheetSection>Conținut secțiune</SheetSection>
      </Sheet>,
    );
    expect(screen.getByText('Conținut secțiune')).toBeDefined();
  });

  it('renders multiple sections', () => {
    render(
      <Sheet>
        <SheetSection>Prima secțiune</SheetSection>
        <SheetSection>A doua secțiune</SheetSection>
      </Sheet>,
    );
    expect(screen.getByText('Prima secțiune')).toBeDefined();
    expect(screen.getByText('A doua secțiune')).toBeDefined();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Sheet>
        <SheetSection>Conținut</SheetSection>
      </Sheet>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
