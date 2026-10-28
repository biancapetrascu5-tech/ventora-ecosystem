import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { AppShell } from '../src/AppShell/AppShell';
import { Spine } from '../src/Spine/Spine';
import { ContextBar } from '../src/ContextBar/ContextBar';

const items = [{ id: 'home', label: 'Acasă', icon: 'home' as const }];
const labels = {
  backToHub: 'Înapoi la aplicații',
  expandMenu: 'Extinde meniul',
  collapseMenu: 'Restrânge meniul',
  more: 'Mai multe',
};

const cbLabels = { search: 'Caută', searchPlaceholder: 'Caută…', create: 'Creează' };

describe('AppShell', () => {
  it('renders children', () => {
    render(
      <AppShell
        spine={<Spine appName="Test" labels={labels} items={items} activeId="home" />}
        contextBar={<ContextBar title="Test App" labels={cbLabels} />}
      >
        <p>Conținut principal</p>
      </AppShell>,
    );
    expect(screen.getByText('Conținut principal')).toBeDefined();
    expect(screen.getByRole('main').id).toBe('v-main');
  });

  it('renders spine', () => {
    render(
      <AppShell spine={<Spine appName="Test" labels={labels} items={items} activeId="home" />}>
        <div>Pagină</div>
      </AppShell>,
    );
    expect(screen.getAllByText('Acasă').length).toBeGreaterThan(0);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <AppShell spine={<Spine appName="Test" labels={labels} items={items} activeId="home" />}>
        <div>Pagină</div>
      </AppShell>,
    );
    // Spine are două nav cu numele aplicației (lateral și bara de jos, ca în bundle.js); în
    // browser una e mereu display: none, dar jsdom nu aplică CSS-ul modulelor.
    const results = await axe.run(container, { rules: { 'landmark-unique': { enabled: false } } });
    expect(results.violations).toHaveLength(0);
  });
});

describe('ContextBar', () => {
  it('numește căutarea și „Creează” din etichete; onCreate fără listă', () => {
    let created = 0;
    render(
      <ContextBar
        title="EasyBook"
        labels={cbLabels}
        onSearch={() => {}}
        onCreate={() => {
          created += 1;
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Caută' }).getAttribute('aria-keyshortcuts')).toBe(
      'Control+K Meta+K',
    );
    screen.getByRole('button', { name: 'Creează' }).click();
    expect(created).toBe(1);
    expect(screen.getByText('EasyBook')).toBeDefined();
  });

  it('fără onSearch și fără creare nu desenează butoanele', () => {
    render(<ContextBar title="Hub" labels={cbLabels} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
