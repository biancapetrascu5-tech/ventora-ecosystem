import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Pagination, pageList, type PaginationLabels } from '../src/Pagination/Pagination';

const L: PaginationLabels = {
  range: (from, to, total) => `${from}–${to} din ${total}`,
  pageOf: (n, total) => `Pagina ${n} din ${total}`,
  rowsPerPage: 'Rânduri pe pagină',
  prevPage: 'Pagina anterioară',
  nextPage: 'Pagina următoare',
};

describe('Pagination', () => {
  it('renders page buttons', () => {
    render(<Pagination page={1} pageSize={20} total={100} onPageChange={vi.fn()} labels={L} />);
    expect(screen.getByRole('button', { name: 'Pagina 1 din 5' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pagina 5 din 5' })).toBeDefined();
  });

  it('calls onPageChange on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={1} pageSize={20} total={100} onPageChange={onChange} labels={L} />);
    await user.click(screen.getByRole('button', { name: 'Pagina 2 din 5' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('shows the range with thousands separator, also for 4 digits', () => {
    const { container } = render(
      <Pagination
        page={4}
        pageSize={20}
        total={1284}
        onPageChange={vi.fn()}
        labels={L}
        locale="ro"
      />,
    );
    expect(container.textContent).toContain('61–80 din 1.284');
  });

  it('page list matches the design (1 … p-1 p p+1 … last)', () => {
    expect(pageList(4, 65)).toEqual([1, '…', 3, 4, 5, '…', 65]);
    expect(pageList(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageList(13, 13)).toEqual([1, '…', 12, 13]);
  });

  it('disables prev on first page', () => {
    render(<Pagination page={1} pageSize={20} total={100} onPageChange={vi.fn()} labels={L} />);
    const prev = screen.getByRole('button', { name: 'Pagina anterioară' });
    expect(prev.getAttribute('disabled')).not.toBeNull();
  });

  it('compact shows „Pagina n din total” instead of numbers', () => {
    const { container } = render(
      <Pagination compact page={2} pageSize={20} total={248} onPageChange={vi.fn()} labels={L} />,
    );
    expect(container.textContent).toContain('Pagina 2 din 13');
    expect(screen.queryByRole('button', { name: 'Pagina 1 din 13' })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Pagination page={3} pageSize={20} total={200} onPageChange={vi.fn()} labels={L} />,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
