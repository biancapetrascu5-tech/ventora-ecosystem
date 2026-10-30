import { describe, expect, it } from 'vitest';
import { ConsumerRegistry, type OutboxConsumer } from '../index';

const consumer = (name: string, type = 'a.b', version = 1): OutboxConsumer => ({
  name,
  handles: [{ type, version }],
  handle: async () => {},
});

describe('ConsumerRegistry', () => {
  it('finds the consumers of an event by type and version, in order', () => {
    const r = new ConsumerRegistry()
      .register(consumer('notifications.invitation'))
      .register(consumer('growth.signals'))
      .register(consumer('other', 'a.b', 2));
    expect(r.consumersFor('a.b', 1).map((c) => c.name)).toEqual([
      'notifications.invitation',
      'growth.signals',
    ]);
    expect(r.consumersFor('a.b', 3)).toEqual([]);
  });

  it('refuses a duplicate or malformed name', () => {
    const r = new ConsumerRegistry().register(consumer('one'));
    expect(() => r.register(consumer('one'))).toThrow();
    expect(() => r.register(consumer('Bad Name'))).toThrow();
  });
});
