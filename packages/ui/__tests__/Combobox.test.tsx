import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from '../src/Combobox/Combobox';

const OPTS = ['Ana Popescu', 'Andrei Ionescu', 'Bianca Marin', 'Ștefan Țăranu'].map((label, i) => ({
  value: i,
  label,
  description: `07${40 + i} 123 45${i}`,
}));
const labels = {
  remove: 'Elimină',
  clearChoice: 'Șterge alegerea',
  loading: 'Se încarcă…',
  noResults: 'Niciun rezultat',
  noResultsFor: (q: string) => `Niciun rezultat pentru „${q}”`,
};

describe('Combobox', () => {
  it('deschis cu căutarea „an”: filtrează după nume și telefon', () => {
    render(<Combobox labels={labels} options={OPTS} defaultOpen defaultQuery="an" />);
    const list = screen.getByRole('listbox');
    const names = within(list)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toHaveLength(4); // Ana, Andrei, Bianca, Ștefan Țăranu (toate conțin „an”)
    expect(names[0]).toContain('Ana Popescu');
  });

  it('fără rezultate: „Niciun rezultat pentru …”', () => {
    render(<Combobox labels={labels} options={OPTS} defaultOpen defaultQuery="xyz" />);
    expect(screen.getByText('Niciun rezultat pentru „xyz”')).toBeDefined();
  });

  it('multiple: chips cu buton de eliminare', async () => {
    render(<Combobox labels={labels} multiple options={OPTS} defaultValue={[0, 2]} />);
    expect(screen.getByText('Ana Popescu')).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Elimină Ana Popescu' }));
    expect(screen.queryByText('Ana Popescu')).toBeNull();
    expect(screen.getByText('Bianca Marin')).toBeDefined();
  });

  it('valoare aleasă: apare ca placeholder și se poate șterge', async () => {
    render(<Combobox labels={labels} options={OPTS} defaultValue={1} />);
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('placeholder')).toBe('Andrei Ionescu');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Șterge alegerea' }));
    expect(screen.getByRole('combobox').getAttribute('placeholder')).toBeNull();
  });

  it('lista preia data-theme al locului (portal)', () => {
    render(
      <div data-theme="dark">
        <Combobox labels={labels} options={OPTS} defaultOpen />
      </div>,
    );
    expect(screen.getByRole('listbox').closest('[data-theme]')?.getAttribute('data-theme')).toBe(
      'dark',
    );
  });
});
