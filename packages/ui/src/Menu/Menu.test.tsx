import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '../AccountMenu/AccountMenu';
import { Menu } from './Menu';

/*
 * Lotul 4.11 (găsit la verificarea manuală pe Vercel): limba aleasă cu mouse-ul din meniul contului
 * nu se aplica. Lista limbilor e un meniu în portal, în afara meniului contului; la `mousedown`,
 * meniul contului se închidea (useOutside) și lua lista cu el, înainte de clic. Un clic într-un
 * meniu deschis din alt meniu nu mai e „în afară” pentru cel care l-a deschis.
 */

/** Ce face un clic real: mousedown, apoi click, în sarcini separate (React re-randează între ele). */
async function mouseClick(el: Element) {
  await act(async () => {
    fireEvent.mouseDown(el);
  });
  await act(async () => {
    fireEvent.mouseUp(el);
    fireEvent.click(el);
  });
}

const LABELS = {
  account: 'Contul tău',
  yourBusinesses: 'Afacerile tale',
  theme: 'Temă',
  language: 'Limbă',
  allApps: 'Toate aplicațiile',
  support: 'Suport',
  signOut: 'Ieși din cont',
  themeSwitcher: { theme: 'Temă', light: 'Luminoasă', dark: 'Întunecată', system: 'Sistem' },
  orgSwitcher: {
    switchBusiness: 'Schimbă afacerea',
    yourBusinesses: 'Afacerile tale',
    findBusiness: 'Caută',
    noResultsFor: (q: string) => `Niciun rezultat pentru „${q}”`,
  },
};

describe('Menu în Menu: clicul în meniul copil nu închide părintele înainte de alegere', () => {
  it('AccountMenu → Limbă → English, cu mouse-ul: onLocaleChange("en")', async () => {
    const onLocaleChange = vi.fn();
    render(
      <AccountMenu
        user={{ name: 'Ana Test', email: 'ana@example.com' }}
        orgs={[]}
        locale="ro"
        onLocaleChange={onLocaleChange}
        theme="system"
        onThemeChange={() => {}}
        onProfile={() => {}}
        onSupport={() => {}}
        onSignOut={() => {}}
        labels={LABELS}
      />,
    );
    await mouseClick(screen.getByRole('button', { name: /Ana Test|Contul tău/ }));
    await mouseClick(screen.getByRole('button', { name: /Română/ }));
    const english = screen.getByRole('menuitemcheckbox', { name: 'English' });
    await mouseClick(english);
    expect(onLocaleChange).toHaveBeenCalledWith('en');
  });

  it('un clic cu adevărat în afară închide în continuare meniul', async () => {
    render(
      <div>
        <button type="button">în afară</button>
        <Menu label="Meniu" items={[{ id: 'a', label: 'Unu' }]}>
          <button type="button">Deschide</button>
        </Menu>
      </div>,
    );
    await mouseClick(screen.getByRole('button', { name: 'Deschide' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await act(async () => fireEvent.mouseDown(screen.getByRole('button', { name: 'în afară' })));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
