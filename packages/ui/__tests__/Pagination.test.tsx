import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Pagination } from '../src/Pagination/Pagination';

describe('Pagination', () => {
  it('renders page buttons', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pagina 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pagina 5' })).toBeDefined();
  });

  it('calls onPageChange on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('shows ellipsis for many pages', () => {
    const { container } = render(<Pagination page={5} totalPages={20} onPageChange={vi.fn()} />);
    expect(container.textContent).toContain('…');
  });

  it('disables prev on first page', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    const prev = screen.getByRole('button', { name: 'Pagina anterioară' });
    expect(prev.getAttribute('disabled')).not.toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Pagination page={3} totalPages={10} onPageChange={vi.fn()} />);
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
