import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Button } from '../src/Button/Button';

describe('Button', () => {
  it('renders label', () => {
    render(<Button>Salvează</Button>);
    expect(screen.getByRole('button', { name: 'Salvează' })).toBeDefined();
  });

  it('is disabled when isDisabled=true', () => {
    render(<Button isDisabled>Salvează</Button>);
    expect(screen.getByRole('button').getAttribute('disabled')).not.toBeNull();
  });

  it('calls onPress when clicked', async () => {
    const user = userEvent.setup();
    let called = false;
    render(
      <Button
        onPress={() => {
          called = true;
        }}
      >
        Click
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(called).toBe(true);
  });

  it('renders all variants without crash', () => {
    const { unmount } = render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="quiet">Quiet</Button>
        <Button variant="danger">Danger</Button>
      </>,
    );
    expect(screen.getAllByRole('button').length).toBe(4);
    unmount();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Button>Salvează</Button>);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});

describe('Button — stări forțate (state)', () => {
  it('adaugă clasa stării, fără să schimbe comportamentul', () => {
    render(
      <>
        <Button variant="primary" state="hover">
          H
        </Button>
        <Button variant="primary">N</Button>
      </>,
    );
    const [h, n] = screen.getAllByRole('button');
    expect(h!.className).not.toBe(n!.className);
    expect(h!.className).toMatch(/isHover/);
  });
});
