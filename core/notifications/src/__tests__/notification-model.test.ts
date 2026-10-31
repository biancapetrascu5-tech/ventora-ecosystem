import { describe, expect, it } from 'vitest';
import { InvalidInput } from '@ventora/errors';
import { SUPPORTED_LOCALES } from '@ventora/i18n';
import designTexts from '../../../../docs/design/system/i18n/notifications.json';
import {
  NotificationCatalog,
  defaultCatalog,
  renderNotification,
  renderNotificationEmail,
  sendNotification,
  UnconfiguredSmsChannel,
  SmsNotConfiguredError,
  defaultEnabled,
  isChangeable,
  type NotificationTemplate,
} from '../index';

// A template on texts the design already translated (i18n/notifications.json, S111).
const PHONE: NotificationTemplate = {
  type: 'messaging.phone_disconnected',
  version: 1,
  category: 'operational',
  group: 'operational',
  titleKey: 'sms.disconnected.title',
  bodyKey: 'sms.disconnected.body',
  channels: ['email'],
  topic: 'phone',
  actionPath: () => '/booking/settings/sms',
};

describe('the catalog', () => {
  it('a template without its category is refused (D4-5)', () => {
    expect(() => new NotificationCatalog([{ ...PHONE, category: undefined as never }])).toThrow(
      /category is required/,
    );
  });

  it('Lot 4.4: an e-mail template names its row of the preferences (topic), of its category', () => {
    expect(() => new NotificationCatalog([{ ...PHONE, topic: undefined }])).toThrow(
      /topic is required/,
    );
    expect(() => new NotificationCatalog([{ ...PHONE, topic: 'news' }])).toThrow(/not operational/);
    expect(() => new NotificationCatalog([{ ...PHONE, security: true }])).toThrow(/security topic/);
    expect(
      () => new NotificationCatalog([{ ...PHONE, security: true, topic: 'password' }]),
    ).not.toThrow();
    // in the app only: no row to turn off
    expect(
      () => new NotificationCatalog([{ ...PHONE, channels: [], topic: undefined }]),
    ).not.toThrow();
  });

  it('Lot 4.4: the fixed rows and the defaults (S114b, D4-6)', () => {
    expect(isChangeable('phone', 'email')).toBe(true);
    expect(isChangeable('phone', 'in_app')).toBe(false);
    expect(isChangeable('password', 'email')).toBe(false);
    expect(isChangeable('recommendations', 'in_app')).toBe(true);
    expect(isChangeable('recommendations', 'email')).toBe(false);
    expect(isChangeable('news', 'email')).toBe(true);
    expect(defaultEnabled('news', 'email')).toBe(false);
    expect(defaultEnabled('bookings', 'email')).toBe(true);
    expect(defaultCatalog.get('commercial.quota.threshold', 1)?.topic).toBe('limits');
  });

  it('S115: the action text, under the text in the panel, in the reader language', () => {
    const withAction = { ...PHONE, actionKey: 'email.open' };
    expect(renderNotification(withAction, { n: '1', time: '9:00' }, 'ro').action).toBe(
      'Deschide în Ventora',
    );
    expect(renderNotification(PHONE, { n: '1', time: '9:00' }, 'ro').action).toBeUndefined();
  });

  it('the first real notification is operational, in the Activity group, in the app only', () => {
    expect(defaultCatalog.get('invitation.new_link_requested', 1)).toMatchObject({
      category: 'operational',
      group: 'activity',
      channels: [],
    });
  });

  it('the Faza 3 templates exist, waiting for their texts (Lot 4.5)', () => {
    expect(defaultCatalog.get('commercial.quota.threshold', 1)?.textsPending).toBe(true);
    expect(defaultCatalog.get('subscription.version_change_scheduled', 1)?.textsPending).toBe(true);
  });
});

describe('the language of the recipient (6 languages)', () => {
  it('the same notification is rendered in each of the 6 languages, as the design wrote it', () => {
    const params = { n: '6', time: '18:00' };
    const titles = new Set<string>();
    for (const locale of SUPPORTED_LOCALES) {
      const { title, body } = renderNotification(PHONE, params, locale);
      const expected = (designTexts as Record<string, Record<string, string>>)[locale]!;
      expect(title).toBe(expected['notifications.sms.disconnected.title']);
      expect(body).toBe(
        expected['notifications.sms.disconnected.body']!.replace('{n}', '6').replace(
          '{time}',
          '18:00',
        ),
      );
      titles.add(title);
    }
    expect(titles.size).toBe(6);
  });

  it('the email is in the recipient language, with the action as a button', () => {
    const catalog = new NotificationCatalog([PHONE]);
    const row = {
      type: PHONE.type,
      version: 1,
      params: { n: '6', time: '18:00' },
      action_url: '/booking/settings/sms',
    };
    const de = renderNotificationEmail(
      row,
      { email: 'ana@example.com', name: 'Ana', locale: 'de' },
      catalog,
    );
    const ro = renderNotificationEmail(
      row,
      { email: 'ana@example.com', name: 'Ana', locale: null },
      catalog,
    );
    expect(de.subject).toBe(
      (designTexts as Record<string, Record<string, string>>).de![
        'notifications.sms.disconnected.title'
      ],
    );
    expect(ro.subject).toBe('Telefonul afacerii e deconectat');
    expect(de.html).toContain('/booking/settings/sms');
  });

  it('a template whose texts come in Lot 4.5 is not rendered', () => {
    const quota = defaultCatalog.get('commercial.quota.threshold', 1)!;
    expect(() => renderNotification(quota, {}, 'ro')).toThrow(/Lot 4\.5/);
  });
});

describe('send: what is refused before touching the database', () => {
  const tx = {
    query: async () => {
      throw new Error('must not be reached');
    },
  };
  const base = {
    type: 'invitation.new_link_requested',
    version: 1,
    organizationId: '0193a4b0-7c1e-7b3a-9f00-1234567890ab',
    recipientUserIds: ['0193a4b0-7c1e-7b3a-9f00-1234567890ac'],
    idempotencyKey: 'evt-1',
  };

  it('a notification without a category is refused (D4-5)', async () => {
    await expect(sendNotification(tx, { ...base } as never)).rejects.toBeInstanceOf(InvalidInput);
    await expect(sendNotification(tx, { ...base, category: 'commercial' })).rejects.toThrow(
      /is operational/,
    );
  });

  it('an unknown type, an empty idempotency key or a bad recipient id are refused', async () => {
    await expect(
      sendNotification(tx, { ...base, category: 'operational', type: 'x.y' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      sendNotification(tx, { ...base, category: 'operational', idempotencyKey: ' ' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await expect(
      sendNotification(tx, { ...base, category: 'operational', recipientUserIds: ['nope'] }),
    ).rejects.toBeInstanceOf(InvalidInput);
  });

  it('a template waiting for its texts is not sent', async () => {
    await expect(
      sendNotification(tx, {
        ...base,
        category: 'operational',
        type: 'commercial.quota.threshold',
      }),
    ).rejects.toThrow(/Lot 4\.5/);
  });
});

describe('the SMS channel is an interface only (D4-26, D4-7)', () => {
  it('without an adapter it says it is not configured', async () => {
    await expect(
      new UnconfiguredSmsChannel().send({ to: '+40700000000', text: 'x', idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(SmsNotConfiguredError);
  });
});
