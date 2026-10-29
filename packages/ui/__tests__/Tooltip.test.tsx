import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Tooltip } from '../src/Tooltip/Tooltip';
import { Button } from '../src/Button/Button';

describe('Tooltip', () => {
  it('renders trigger', () => {
    render(
      <Tooltip content="Informație">
        <Button>Hover me</Button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Hover me' })).toBeDefined();
  });

  it('has no axe violations on trigger', async () => {
    const { container } = render(
      <Tooltip content="Informație utilă">
        <Button>Acțiune</Button>
      </Tooltip>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
