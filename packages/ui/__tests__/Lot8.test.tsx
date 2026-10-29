import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessBadge } from '../src/AccessBadge/AccessBadge';
import { AppDock } from '../src/AppDock/AppDock';
import { AppLaunch } from '../src/AppLaunch/AppLaunch';
import { AppTile, type AppTileLabels } from '../src/AppTile/AppTile';
import { AuthLayout } from '../src/AuthLayout/AuthLayout';
import { DiscoveryTooltip } from '../src/DiscoveryTooltip/DiscoveryTooltip';
import { GrowthSlot } from '../src/GrowthSlot/GrowthSlot';
import { PortalPresence } from '../src/PortalPresence/PortalPresence';
import { RecommendationCard } from '../src/RecommendationCard/RecommendationCard';
import { RuleBuilder } from '../src/RuleBuilder/RuleBuilder';

const ACCESS = {
  available: 'Disponibilă',
  unavailable: 'Temporar indisponibilă',
  notInRole: 'Nu e în rolul tău',
  notInPlan: 'Nu e în abonament',
};
const REMIND = {
  moreOptions: 'Mai multe opțiuni',
  remindLater: 'Amintește-mi mai târziu',
  remindWeek: 'Peste o săptămână',
  remindMonth: 'Peste o lună',
  notInterested: 'Nu mă interesează',
};
const TILE: AppTileLabels = {
  access: ACCESS,
  hintUnavailable: 'Lucrăm la ea acum.',
  hintNotInRole: (who) => `${who} îți poate da acces.`,
  hintNotInRoleNoOne: 'Proprietarul îți poate da acces.',
  hintNotInPlan: 'Nu e inclusă în abonament.',
  requestAccess: 'Cere acces',
  writeUs: 'Scrie-ne',
  seeStatus: 'Vezi starea',
  openApp: (app) => `Deschide ${app}`,
  unreadN: (n) => `${n} necitite`,
  seeDetails: 'Vezi detaliile',
  recommendation: 'Recomandare',
  remind: REMIND,
};
const RECO = {
  recommendation: 'Recomandare',
  recommendSend: 'Recomandă',
  decides: (who: string) => `Ajunge la ${who}.`,
  recommendSent: (who: string) => `Am trimis recomandarea către ${who}.`,
  recoActivated: 'Activată',
  recoDeclined: 'Nu acum',
  recoPending: 'În așteptare',
  remind: REMIND,
};

describe('AccessBadge și AppTile', () => {
  it('AccessBadge arată textul stării', () => {
    render(<AccessBadge state="notInPlan" labels={ACCESS} />);
    expect(screen.getByText('Nu e în abonament')).toBeDefined();
  });

  it('o aplicație disponibilă se deschide cu numele ei', async () => {
    const onOpen = vi.fn();
    render(<AppTile app="booking" onOpen={onOpen} labels={TILE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deschide EasyBook' }));
    expect(onOpen.mock.calls[0]![1]).toBe('EasyBook');
  });

  it('blocată în rol: grup dezactivat, explicația cu cine dă acces și „Cere acces”', async () => {
    const onRequestAccess = vi.fn();
    render(
      <AppTile
        app="analytics"
        access="notInRole"
        grantedBy="Bianca"
        onRequestAccess={onRequestAccess}
        labels={TILE}
      />,
    );
    const g = screen.getByRole('group');
    expect(g.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Bianca îți poate da acces.')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Cere acces' }));
    expect(onRequestAccess).toHaveBeenCalled();
  });
});

describe('AppDock', () => {
  it('lista are numele din etichetă și deschide aplicația', async () => {
    const onOpen = vi.fn();
    render(
      <AppDock
        apps={[{ app: 'booking', badge: 2 }, { app: 'crm' }]}
        label="Aplicațiile tale"
        tileLabels={TILE}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole('list', { name: 'Aplicațiile tale' })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByLabelText('2 necitite')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Deschide ClientDesk' }));
    expect(onOpen.mock.calls[0]![1]).toBe('crm');
  });
});

describe('RecommendationCard și GrowthSlot', () => {
  it('proprietarul acționează; „Nu mă interesează” doar la recomandările proactive', async () => {
    const onAction = vi.fn();
    render(
      <RecommendationCard
        app="crm"
        title="Ține istoricul clienților"
        actionLabel="Vezi opțiunile"
        onAction={onAction}
        onDismiss={() => {}}
        labels={RECO}
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Recomandare: Ține istoricul clienților' }),
    ).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Vezi opțiunile' }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nu mă interesează' })).toBeDefined();
  });

  it('membrul după recomandare vede starea și cui a trimis-o', () => {
    render(
      <RecommendationCard
        proactive={false}
        role="member"
        title="CampaignKit"
        decider="Bianca"
        recommended
        labels={RECO}
      />,
    );
    expect(screen.getByText('În așteptare')).toBeDefined();
    expect(screen.getByText('Am trimis recomandarea către Bianca.')).toBeDefined();
  });

  it('GrowthSlot fără conținut nu desenează nimic', () => {
    const { container } = render(<GrowthSlot label="Recomandare">{null}</GrowthSlot>);
    expect(container.firstChild).toBeNull();
  });
});

describe('DiscoveryTooltip', () => {
  it('deschis: dialog cu „Am înțeles”; închis: doar elementul', async () => {
    const onGotIt = vi.fn();
    const L = {
      gotIt: 'Am înțeles',
      seeHow: 'Vezi cum funcționează',
      recommendation: 'Recomandare',
    };
    const { rerender } = render(
      <DiscoveryTooltip title="Exportul merge" onGotIt={onGotIt} labels={L}>
        <button type="button">Exportă</button>
      </DiscoveryTooltip>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Am înțeles' }));
    expect(onGotIt).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Exportul merge' })).toBeDefined();
    rerender(
      <DiscoveryTooltip open={false} title="Exportul merge" labels={L}>
        <button type="button">Exportă</button>
      </DiscoveryTooltip>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PortalPresence', () => {
  const L = {
    eyebrow: 'Portal',
    title: 'Pagina afacerii în Portal',
    description: 'Clienții te găsesc în Portal.',
    noManage: 'Doar proprietarul o poate schimba.',
    manage: 'Gestionează pagina',
    finish: 'Termină pagina',
    preview: 'Vezi cum arată în Portal',
    newTab: 'se deschide într-un tab nou',
    published: 'Publicată',
    hidden: 'Ascunsă',
    draft: 'Nu e publicată încă',
  };

  it('nepublicată: „Termină pagina”, fără previzualizare', () => {
    render(<PortalPresence status="draft" onManage={() => {}} labels={L} />);
    expect(screen.getByRole('button', { name: 'Termină pagina' })).toBeDefined();
    expect(screen.queryByText('Vezi cum arată în Portal')).toBeNull();
  });

  it('membrul vede nota și nu are buton de gestionare', () => {
    render(<PortalPresence canManage={false} previewHref="#" labels={L} />);
    expect(screen.getByText('Doar proprietarul o poate schimba.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Gestionează pagina' })).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Vezi cum arată în Portal (se deschide într-un tab nou)',
      }),
    ).toBeDefined();
  });
});

describe('RuleBuilder', () => {
  const L = {
    matchLabel: 'Afacerea trebuie să îndeplinească',
    matchAll: 'Toate condițiile',
    matchAny: 'Oricare dintre ele',
    ruleN: (n: number) => `Condiția ${n}`,
    criterion: 'Criteriu',
    operator: 'Condiție',
    value: 'Valoare',
    removeCondition: 'Șterge condiția',
    addCondition: 'Adaugă o condiție',
    eligibleN: (n: number) => `Aproximativ ${n} afaceri eligibile`,
  };
  const criteria = [
    { value: 'role', label: 'Rol', operators: ['este'], values: ['Proprietar', 'Membru'] },
    { value: 'age', label: 'Vechime', operators: ['peste'], unit: 'zile' },
  ];

  it('numește rândurile, șterge și adaugă condiții, arată estimarea', async () => {
    render(
      <RuleBuilder
        criteria={criteria}
        rules={[
          { id: 'a', criterion: 'role', operator: 'este', value: 'Proprietar' },
          { id: 'b', criterion: 'age', operator: 'peste', value: '30' },
        ]}
        estimate={46}
        labels={L}
      />,
    );
    expect(screen.getByRole('group', { name: 'Condiția 1: Rol este Proprietar' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Condiția 2: Vechime peste 30 zile' })).toBeDefined();
    expect(screen.getByText('Aproximativ 46 afaceri eligibile')).toBeDefined();
    await userEvent.click(screen.getAllByRole('button', { name: 'Șterge condiția' })[0]!);
    expect(screen.queryByRole('group', { name: /Condiția 2/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă o condiție' }));
    expect(screen.getByRole('group', { name: /Condiția 2/ })).toBeDefined();
  });
});

describe('AuthLayout', () => {
  it('Hub: fraza, formularul și subsolul; Founder: „Founder” fără selector', () => {
    const { rerender } = render(
      <AuthLayout statement="Afacerea ta." footer="Termeni">
        <p>formular</p>
      </AuthLayout>,
    );
    expect(screen.getByText('Afacerea ta.')).toBeDefined();
    expect(screen.getByRole('main').textContent).toContain('formular');
    expect(screen.getByText('Termeni')).toBeDefined();
    rerender(
      <AuthLayout brand="founder">
        <p>formular</p>
      </AuthLayout>,
    );
    expect(screen.getByText('Founder')).toBeDefined();
  });
});

describe('AppLaunch', () => {
  // jsdom nu are Web Animations (Element.animate); un stub care respectă interfața folosită.
  Element.prototype.animate = function () {
    return { pause() {}, cancel() {}, currentTime: 0 } as unknown as Animation;
  };
  it('anunță deschiderea și arată numele aplicației', () => {
    render(
      <AppLaunch app="booking" contained progress={1} openingLabel={(a) => `Se deschide ${a}`} />,
    );
    expect(screen.getByText('Se deschide EasyBook')).toBeDefined();
    expect(screen.getAllByText('EasyBook').length).toBeGreaterThan(0);
  });

  it('fără progres apelează onDone după animație', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<AppLaunch app="crm" contained onDone={onDone} openingLabel={(a) => a} />);
    vi.advanceTimersByTime(1000);
    expect(onDone).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
