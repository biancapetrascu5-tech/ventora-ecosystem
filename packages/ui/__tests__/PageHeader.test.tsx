import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { PageHeader } from '../src/PageHeader/PageHeader';
import { Button } from '../src/Button/Button';

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Setări cont" />);
    expect(screen.getByRole('heading', { name: 'Setări cont' })).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<PageHeader title="Dashboard" subtitle="Bun venit înapoi" />);
    expect(screen.getByText('Bun venit înapoi')).toBeDefined();
  });

  it('renders actions', () => {
    render(<PageHeader title="Produse" actions={<Button>Adaugă produs</Button>} />);
    expect(screen.getByRole('button', { name: 'Adaugă produs' })).toBeDefined();
  });

  it('has no axe violations', async () => {
    const { container } = render(<PageHeader title="Test" subtitle="Subtitlu" />);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
