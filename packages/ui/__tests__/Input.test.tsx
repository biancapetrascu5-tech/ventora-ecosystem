import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Input } from '../src/Input/Input';

describe('Input', () => {
  it('renders placeholder', () => {
    render(<Input placeholder="Caută..." />);
    expect(screen.getByPlaceholderText('Caută...')).toBeDefined();
  });

  it('accepts user input', async () => {
    const user = userEvent.setup();
    render(<Input />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'test');
    expect((input as HTMLInputElement).value).toBe('test');
  });

  it('marks aria-invalid when isInvalid=true', () => {
    render(<Input isInvalid />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <label>
        Email <Input type="email" />
      </label>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
