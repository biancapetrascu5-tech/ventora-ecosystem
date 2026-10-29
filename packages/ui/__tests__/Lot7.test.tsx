import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../src/AccountMenu/AccountMenu';
import { AddonPurchase } from '../src/AddonPurchase/AddonPurchase';
import type { PaymentLabels } from '../src/AddonPurchase/Payment';
import { BrandZone } from '../src/BrandZone/BrandZone';
import { Logo } from '../src/Logo/Logo';
import { NotificationsPanel } from '../src/NotificationsPanel/NotificationsPanel';
import { OrgSwitcher } from '../src/OrgSwitcher/OrgSwitcher';
import { UpgradeDialog, type UpgradeOption } from '../src/UpgradeDialog/UpgradeDialog';

const ORG_L = {
  switchBusiness: 'Schimbă afacerea',
  yourBusinesses: 'Afacerile tale',
  findBusiness: 'Caută o afacere',
  noResultsFor: (q: string) => `Niciun rezultat pentru „${q}”`,
};
const THEME_L = { theme: 'Temă', light: 'Luminoasă', dark: 'Întunecată', system: 'Ca sistemul' };
const ACCOUNT_L = {
  account: 'Contul tău',
  yourBusinesses: 'Afacerile tale',
  theme: 'Temă',
  language: 'Limbă',
  allApps: 'Toate aplicațiile Ventora',
  support: 'Ajutor și suport',
  signOut: 'Ieși din cont',
  themeSwitcher: THEME_L,
  orgSwitcher: ORG_L,
};
const NOTIF_L = {
  notifications: 'Notificări',
  unreadN: (n: number) => `${n} necitite`,
  markAllRead: 'Marchează tot ca citit',
  notificationSettings: 'Setări notificări',
  all: 'Toate',
  unread: 'Necitite',
  noNotifications: 'Nicio notificare',
  noNotificationsHint: 'Aici apar noutățile.',
  operational: 'Despre cont',
  activity: 'Activitate',
  recommendations: 'Recomandări',
  recommendation: 'Recomandare',
  fromTeam: 'De la echipa Ventora',
  seeApp: 'Vezi aplicația',
  reject: 'Refuză',
  seeDetails: 'Vezi detalii',
  notInterested: 'Nu mă interesează',
};
const PAY_L: PaymentLabels = {
  expires: (d) => `expiră ${d}`,
  changeCard: 'Schimbă cardul',
  stripeSlot: 'Formular Stripe',
  saveCard: 'Salvează cardul',
  processingHint: 'Durează câteva secunde.',
  paySuccessHint: 'Limita a crescut deja.',
  before: 'Înainte',
  after: 'Acum',
  invoiceIssued: (nr) => `Factura ${nr} e gata`,
  seeInvoice: 'Vezi factura',
  payFailed: 'Plata nu a trecut',
  noMoneyTaken: 'Nu ți-am luat bani.',
  whatYouCanDo: 'Ce poți face',
  tryAgain: 'Încearcă din nou',
  useOtherCard: 'Folosește alt card',
  callBank: 'Sună la bancă',
};
const ADDON_L = {
  ...PAY_L,
  processing: 'Procesăm plata…',
  paySuccess: 'Plata a reușit',
  payAmount: (a: string) => `Plătește ${a}`,
  done: 'Gata',
  cancel: 'Renunță',
  quantity: 'Cantitate',
  decrease: 'Scade cantitatea',
  increase: 'Crește cantitatea',
  total: 'Total',
  finalPrice: 'Prețul e final.',
  payWith: 'Plătești cu cardul',
  cardExpiring: 'Cardul expiră.',
  noCardSaved: 'Fără card salvat.',
  close: 'Închide',
};
const UP_L = {
  ...PAY_L,
  chooseOption: 'Alege ce ți se potrivește',
  nothingLost: 'Nu se pierde nimic din ce ai.',
  decides: (who: string) => `Ajunge la ${who}.`,
  recommendSent: (who: string) => `Am trimis recomandarea către ${who}.`,
  recommendSend: 'Recomandă',
  cancel: 'Renunță',
  continueBtn: 'Continuă',
  close: 'Închide',
  back: 'Înapoi',
  youActivate: 'Ce activezi',
  whenLabel: 'Când',
  priceLabel: 'Preț',
  setupCost: 'Cost de implementare',
  noneCost: 'Fără',
  payToday: 'Plătești azi',
  planRequestNote: 'Nu plătești nimic acum.',
  trialNoCard: 'Nu ai nevoie de card.',
  upgrade: 'Cere alt abonament',
  startTrial: 'Începe perioada de probă',
  activating: 'Activăm…',
  processing: 'Procesăm plata…',
  paySuccess: 'Plata a reușit',
  trialActive: 'Perioada de probă a început',
  done: 'Gata',
  payAmount: (a: string) => `Plătește ${a}`,
  payWith: 'Plătești cu cardul',
  noCardSaved: 'Fără card salvat.',
};

const ORGS = [
  { id: 'a', name: 'Salon Aurora', role: 'Proprietar' },
  { id: 'd', name: 'Clinica Dentis', role: 'Recepție' },
];

describe('OrgSwitcher', () => {
  it('cu o singură afacere e static (fără buton)', () => {
    render(<OrgSwitcher orgs={[ORGS[0]!]} currentId="a" labels={ORG_L} />);
    expect(screen.getByText('Salon Aurora')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('deschide lista legată prin aria-controls și alege altă afacere', async () => {
    const onChange = vi.fn();
    render(<OrgSwitcher orgs={ORGS} currentId="a" onChange={onChange} labels={ORG_L} />);
    const btn = screen.getByRole('button', { name: /Schimbă afacerea/ });
    await userEvent.click(btn);
    const list = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(list).not.toBeNull();
    await userEvent.click(within(list).getByText('Clinica Dentis'));
    expect(onChange).toHaveBeenCalledWith('d');
  });
});

describe('NotificationsPanel', () => {
  const items = [
    { id: 1, title: 'Telefonul s-a deconectat', category: 'operational' as const },
    { id: 2, title: 'Programare nouă' },
    { id: 3, title: 'Export gata', read: true },
  ];

  it('clopoțelul numără toate necititele, ca în design', () => {
    render(<NotificationsPanel items={items} labels={NOTIF_L} />);
    expect(screen.getByRole('button', { name: /2 necitite/ })).toBeDefined();
  });

  it('countCategory="operational" numără doar operaționalele', () => {
    render(<NotificationsPanel items={items} countCategory="operational" labels={NOTIF_L} />);
    expect(screen.getByRole('button', { name: /1 necitite/ })).toBeDefined();
  });
});

describe('AccountMenu', () => {
  it('meniul are contul, ieșirea și, cu onCatalog, toate aplicațiile', async () => {
    const onSignOut = vi.fn();
    render(
      <AccountMenu
        user={{ name: 'Bianca Petrașcu', email: 'bianca@salonaurora.ro' }}
        onCatalog={() => {}}
        onSignOut={onSignOut}
        labels={ACCOUNT_L}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Contul tău/ }));
    expect(screen.getByText('bianca@salonaurora.ro')).toBeDefined();
    expect(screen.getByText('Toate aplicațiile Ventora')).toBeDefined();
    await userEvent.click(screen.getByText('Ieși din cont'));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe('AddonPurchase', () => {
  const addon = { name: '10 campanii în plus', price: 39, max: 3 };

  it('stepperul schimbă totalul și plătește cantitatea aleasă', async () => {
    const onPay = vi.fn();
    render(
      <AddonPurchase
        addon={addon}
        card={{ brand: 'Visa', last4: '4242' }}
        onPay={onPay}
        format={(n) => `${n} lei`}
        labels={ADDON_L}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crește cantitatea' }));
    await userEvent.click(screen.getByRole('button', { name: 'Plătește 78 lei' }));
    expect(onPay).toHaveBeenCalledWith(2, 78);
  });

  it('fără card arată locul formularului Stripe (cardSlot)', () => {
    render(
      <AddonPurchase
        addon={addon}
        card={null}
        cardSlot={<span>formularul Stripe</span>}
        labels={ADDON_L}
      />,
    );
    expect(screen.getByText('Fără card salvat.')).toBeDefined();
    expect(screen.getByText('formularul Stripe')).toBeDefined();
  });

  it('eroarea e alertdialog cu „Plata nu a trecut”', () => {
    render(<AddonPurchase addon={addon} state="error" card={null} labels={ADDON_L} />);
    expect(screen.getByRole('alertdialog', { name: 'Plata nu a trecut' })).toBeDefined();
  });
});

describe('UpgradeDialog', () => {
  const options: UpgradeOption[] = [
    { id: 'pack', kind: 'pack', title: 'Pachet de 200', price: '39 lei' },
    { id: 'plan', kind: 'plan', title: 'Business Plus', price: '449 lei pe lună' },
  ];

  it('proprietarul alege o variantă și continuă cu ea', async () => {
    const onContinue = vi.fn();
    render(
      <UpgradeDialog title="Limita" options={options} onContinue={onContinue} labels={UP_L} />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /Business Plus/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuă' }));
    expect(onContinue).toHaveBeenCalledWith('plan');
  });

  it('membrul vede variantele fără radio și cine decide', () => {
    render(
      <UpgradeDialog
        title="Limita"
        role="member"
        options={options}
        decider="Bianca (proprietar)"
        onRecommend={() => {}}
        labels={UP_L}
      />,
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('Ajunge la Bianca (proprietar).')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Recomandă' })).toBeDefined();
  });

  it('confirmarea unui abonament rămâne cerere (fără plată azi)', () => {
    render(
      <UpgradeDialog
        step="confirm"
        title="Trimite cererea"
        options={options}
        value="plan"
        summary={{ total: '449 lei' }}
        labels={UP_L}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cere alt abonament' })).toBeDefined();
    expect(screen.queryByText('Plătești azi')).toBeNull();
    expect(screen.getByText('Nu plătești nimic acum.')).toBeDefined();
  });
});

describe('Logo și BrandZone', () => {
  it('Logo are numele mărcii; fără titlu e decorativ', () => {
    const { container, rerender } = render(<Logo />);
    expect(screen.getByRole('img', { name: 'Ventora' })).toBeDefined();
    rerender(<Logo variant="mark" title="" />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });

  it('BrandZone pune conținutul pe tema dark', () => {
    render(
      <BrandZone>
        <span>bara</span>
      </BrandZone>,
    );
    expect(screen.getByText('bara').parentElement!.getAttribute('data-theme')).toBe('dark');
  });
});
