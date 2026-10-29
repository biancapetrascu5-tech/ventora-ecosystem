import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { FileUpload, fmtSize, type FileUploadLabels } from '../src/FileUpload/FileUpload';

const labels: FileUploadLabels = {
  dropFiles: 'Trage fișierele aici sau',
  dropNow: 'Dă drumul ca să încarci',
  browse: 'alege-le de pe dispozitiv',
  maxSize: (size) => `Până la ${size} de fiecare fișier`,
  uploaded: 'Încărcat',
  retry: 'Încearcă din nou',
  remove: 'Elimină',
};

describe('FileUpload', () => {
  it('arată textul zonei, ajutorul și mărimea maximă', () => {
    render(<FileUpload labels={labels} hint="PDF, JPG sau PNG" maxSize={10485760} />);
    expect(screen.getByRole('button', { name: 'alege-le de pe dispozitiv' })).toBeDefined();
    expect(screen.getByText('PDF, JPG sau PNG · Până la 10 MB de fiecare fișier')).toBeDefined();
  });

  it('starea drag arată „Dă drumul ca să încarci”', () => {
    render(<FileUpload labels={labels} state="drag" />);
    expect(screen.getByText('Dă drumul ca să încarci')).toBeDefined();
  });

  it('lista: încărcat, procent, eroare cu „Încearcă din nou”', async () => {
    const onRetry = vi.fn();
    render(
      <FileUpload
        labels={labels}
        onRetry={onRetry}
        onRemove={() => {}}
        files={[
          { id: 1, name: 'contract.pdf', size: 482e3, status: 'done' },
          { id: 2, name: 'poze.zip', size: 184e5, status: 'uploading', progress: 64 },
          { id: 3, name: 'buletin.heic', size: 32e5, status: 'error', error: 'Format neacceptat.' },
        ]}
      />,
    );
    expect(screen.getByText('Încărcat')).toBeDefined();
    expect(screen.getByText('64%')).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'poze.zip' })).toBeDefined();
    expect(screen.getByText('Format neacceptat.')).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('fmtSize: separator zecimal după limbă', () => {
    expect(fmtSize(3.2e6, 'ro')).toBe('3,1 MB');
    expect(fmtSize(3.2e6, 'en')).toBe('3.1 MB');
    expect(fmtSize(500, 'ro')).toBe('500 B');
  });

  it('has no axe violations', async () => {
    const { container } = render(<FileUpload labels={labels} hint="PDF" />);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
