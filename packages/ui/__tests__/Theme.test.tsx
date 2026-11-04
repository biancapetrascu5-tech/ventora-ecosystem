import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../src/AccountMenu/AccountMenu';
import { VentoraProvider } from '../src/provider/VentoraProvider';
import { useTheme, useThemeChoice } from '../src/provider/useTheme';
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '../src/provider/ThemeScript';

const THEME_L = { theme: 'Temă', light: 'Luminoasă', dark: 'Întunecată', system: 'Ca sistemul' };
const ACCOUNT_L = {
  account: 'Contul tău',
  yourBusinesses: 'Afacerile tale',
  theme: 'Temă',
  language: 'Limbă',
  allApps: 'Toate aplicațiile Ventora Systems',
  support: 'Ajutor și suport',
  signOut: 'Ieși din cont',
  themeSwitcher: THEME_L,
  orgSwitcher: {
    switchBusiness: 'Schimbă afacerea',
    yourBusinesses: 'Afacerile tale',
    findBusiness: 'Caută o afacere',
    noResultsFor: (q: string) => `Niciun rezultat pentru „${q}”`,
  },
};

/** prefers-color-scheme controlabil din test. */
function mockSystemTheme(initial: 'light' | 'dark') {
  const listeners = new Set<() => void>();
  const mq = {
    matches: initial === 'dark',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn().mockReturnValue(mq) as unknown as typeof window.matchMedia;
  return (next: 'light' | 'dark') => {
    mq.matches = next === 'dark';
    listeners.forEach((fn) => fn());
  };
}

/** Ce face un shell (HubShell, FounderShell): dă AccountMenu-ului tema din context. */
function ShellAccountMenu() {
  const themeChoice = useThemeChoice();
  const { resolvedTheme } = useTheme();
  return (
    <>
      <AccountMenu
        user={{ name: 'Bianca Petrașcu', email: 'bianca@salonaurora.ro' }}
        theme={themeChoice.theme}
        onThemeChange={themeChoice.onThemeChange}
        onSignOut={() => {}}
        labels={ACCOUNT_L}
      />
      <output data-testid="resolved">{resolvedTheme}</output>
    </>
  );
}

const html = document.documentElement;

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /Contul tău/ }));
}

describe('tema: shell → AccountMenu → VentoraProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    html.removeAttribute('data-theme');
    mockSystemTheme('light');
  });

  it('light / dark / sistem schimbă data-theme pe <html> și salvează alegerea', async () => {
    render(
      <VentoraProvider>
        <ShellAccountMenu />
      </VentoraProvider>,
    );
    await openMenu();

    await userEvent.click(screen.getByRole('radio', { name: 'Întunecată' }));
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect((screen.getByRole('radio', { name: 'Întunecată' }) as HTMLInputElement).checked).toBe(
      true,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Luminoasă' }));
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await userEvent.click(screen.getByRole('radio', { name: 'Ca sistemul' }));
    expect(html.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto');
  });

  it('după reîncărcare: alegerea salvată e în comutator, iar <html> nu pierde tema pusă de script', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    new Function(THEME_INIT_SCRIPT)();
    expect(html.getAttribute('data-theme')).toBe('dark');

    const removed = vi.spyOn(html, 'removeAttribute');
    render(
      <VentoraProvider>
        <ShellAccountMenu />
      </VentoraProvider>,
    );
    await openMenu();

    expect((screen.getByRole('radio', { name: 'Întunecată' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(removed).not.toHaveBeenCalledWith('data-theme');
    removed.mockRestore();
  });

  it('„sistem” urmează schimbarea temei din sistemul de operare', () => {
    const setSystem = mockSystemTheme('light');
    render(
      <VentoraProvider>
        <ShellAccountMenu />
      </VentoraProvider>,
    );
    expect(screen.getByTestId('resolved').textContent).toBe('light');

    act(() => setSystem('dark'));
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(html.hasAttribute('data-theme')).toBe(false);
  });
});

describe('THEME_INIT_SCRIPT', () => {
  beforeEach(() => {
    localStorage.clear();
    html.removeAttribute('data-theme');
  });

  it('„auto” sau nimic salvat: fără atribut (urmează sistemul)', () => {
    new Function(THEME_INIT_SCRIPT)();
    expect(html.hasAttribute('data-theme')).toBe(false);

    localStorage.setItem(THEME_STORAGE_KEY, 'auto');
    new Function(THEME_INIT_SCRIPT)();
    expect(html.hasAttribute('data-theme')).toBe(false);
  });

  it('localStorage care aruncă nu oprește pagina, nici provider-ul', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    mockSystemTheme('light');

    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(() =>
      render(
        <VentoraProvider>
          <ShellAccountMenu />
        </VentoraProvider>,
      ),
    ).not.toThrow();
    getItem.mockRestore();
  });
});
