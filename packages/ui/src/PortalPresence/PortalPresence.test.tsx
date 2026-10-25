import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PortalPresence } from './PortalPresence';

describe('PortalPresence', () => {
  it('renders published state with manage and preview buttons', () => {
    const onManage = vi.fn();
    render(
      <PortalPresence status="published" onManage={onManage} previewHref="https://example.com" />,
    );
    expect(screen.getByText('Publicată')).toBeTruthy();
    expect(screen.getByText('Gestionează pagina')).toBeTruthy();
    expect(screen.getByText('Vezi cum arată în Portal')).toBeTruthy();
  });

  it('renders hidden state without preview link', () => {
    const onManage = vi.fn();
    render(<PortalPresence status="hidden" onManage={onManage} />);
    expect(screen.getByText('Ascunsă')).toBeTruthy();
    expect(screen.getByText('Gestionează pagina')).toBeTruthy();
    expect(screen.queryByText('Vezi cum arată în Portal')).toBeNull();
  });

  it('renders draft state with Termină pagina button', () => {
    const onManage = vi.fn();
    render(<PortalPresence status="draft" onManage={onManage} />);
    expect(screen.getByText('Nu e publicată încă')).toBeTruthy();
    expect(screen.getByText('Termină pagina')).toBeTruthy();
  });

  it('hides manage button when canManage is false', () => {
    render(
      <PortalPresence status="published" canManage={false} previewHref="https://example.com" />,
    );
    expect(screen.queryByText('Gestionează pagina')).toBeNull();
    expect(
      screen.getByText(
        'Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.',
      ),
    ).toBeTruthy();
  });

  it('calls onManage when manage button is clicked', () => {
    const onManage = vi.fn();
    render(<PortalPresence status="published" onManage={onManage} />);
    fireEvent.click(screen.getByText('Gestionează pagina'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('applies compact class', () => {
    const { container } = render(<PortalPresence status="published" compact onManage={() => {}} />);
    const card = container.querySelector('.v-portalcard');
    expect(card?.className).toContain('compact');
  });
});
