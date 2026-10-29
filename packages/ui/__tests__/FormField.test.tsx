import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { FormField } from '../src/FormField/FormField';
import { Input } from '../src/Input/Input';

describe('FormField', () => {
  it('renders label and input', () => {
    render(<FormField label="Email">{({ id }) => <Input id={id} type="email" />}</FormField>);
    expect(screen.getByLabelText('Email')).toBeDefined();
  });

  it('shows hint text', () => {
    render(
      <FormField label="Cod poștal" hint="Format: 6 cifre">
        <Input />
      </FormField>,
    );
    expect(screen.getByText('Format: 6 cifre')).toBeDefined();
  });

  it('shows error message with role=alert', () => {
    render(
      <FormField label="Email" error="Adresă invalidă">
        <Input />
      </FormField>,
    );
    const error = screen.getByRole('alert');
    expect(error.textContent).toContain('Adresă invalidă');
  });

  it('hides hint when error present', () => {
    render(
      <FormField label="Email" hint="Hint" error="Eroare">
        <Input />
      </FormField>,
    );
    expect(screen.queryByText('Hint')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FormField label="Email" required>
        {({ id, isInvalid }) => <Input id={id} isInvalid={isInvalid} type="email" />}
      </FormField>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
