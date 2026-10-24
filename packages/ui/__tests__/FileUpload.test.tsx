import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { FileUpload } from '../src/FileUpload/FileUpload';

describe('FileUpload', () => {
  it('renders title and hint', () => {
    render(
      <FileUpload title="Încarcă fișiere" hint="PDF, max 5MB" />
    );
    expect(screen.getByText('Încarcă fișiere')).toBeDefined();
    expect(screen.getByText('PDF, max 5MB')).toBeDefined();
  });

  it('dropzone renders file input', () => {
    const { container } = render(<FileUpload title="Upload" />);
    expect(container.querySelector('input[type="file"]')).toBeDefined();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FileUpload title="Încarcă documente" hint="PDF, DOCX — max 10MB" />
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
