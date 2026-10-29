import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableLabels } from '../src/DataTable/DataTable';

const L: DataTableLabels = {
  selectedN: (n) => `${n} selectate`,
  clearSelection: 'Renunță la selecție',
  selectAll: 'Selectează toate rândurile',
  selectRow: 'Selectează rândul',
  sortAsc: 'Sortat crescător',
  sortDesc: 'Sortat descrescător',
  rowActions: 'Acțiuni',
  pagination: {
    range: (from, to, total) => `${from}–${to} din ${total}`,
    pageOf: (n, total) => `Pagina ${n} din ${total}`,
    rowsPerPage: 'Rânduri pe pagină',
    prevPage: 'Pagina anterioară',
    nextPage: 'Pagina următoare',
  },
};
const rows = [
  { id: 1, client: 'Ana Popescu', price: 120 },
  { id: 2, client: 'Andrei Ionescu', price: 350 },
];
const columns = [
  { key: 'client', header: 'Client', sortable: true, primary: true },
  { key: 'price', header: 'Preț', align: 'end' as const },
];

describe('DataTable', () => {
  it('arată bara de selecție cu textul din labels', () => {
    render(<DataTable columns={columns} rows={rows} selectable selected={[1, 2]} labels={L} />);
    expect(screen.getByRole('region', { name: '2 selectate' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Renunță la selecție' })).toBeDefined();
  });

  it('sortarea trece asc → desc → fără', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const { rerender } = render(
      <DataTable columns={columns} rows={rows} onSortChange={onSort} labels={L} />,
    );
    await user.click(screen.getByRole('button', { name: 'Client' }));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'client', dir: 'asc' });
    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        sort={{ key: 'client', dir: 'desc' }}
        onSortChange={onSort}
        labels={L}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Client/ }));
    expect(onSort).toHaveBeenLastCalledWith(null);
  });

  it('paginarea folosește separatorul de mii', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        pagination={{ page: 1, pageSize: 20, total: 1284, onPageChange: vi.fn() }}
        labels={L}
        locale="ro"
      />,
    );
    expect(container.textContent).toContain('1–20 din 1.284');
  });

  it('afișează conținutul gol când nu sunt rânduri', () => {
    render(<DataTable columns={columns} rows={[]} empty={<p>Nimic</p>} labels={L} />);
    expect(screen.getByText('Nimic')).toBeDefined();
  });
});
