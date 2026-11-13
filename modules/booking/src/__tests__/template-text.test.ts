import { describe, expect, it } from 'vitest';
import {
  fillTemplate,
  paragraphs,
  unknownVariables,
  validateTemplate,
} from '../server/template-text';

/* Lot B.14b: the rules of the business's texts (the same in the editor and on the server). */

const values = {
  client: 'Cristina',
  service: 'Vopsit rădăcină',
  date: 'joi, 19 noiembrie',
  time: '10:00',
  member: 'Ioana Pavel',
  business: 'Salon Aurora',
  link: 'https://app.example/r/aurora/m/x',
};

describe('the business’s texts', () => {
  it('finds the unknown variables, once each, in order', () => {
    expect(unknownVariables('Bună, {clinet}! {client} {data} {clinet}')).toEqual([
      'clinet',
      'data',
    ]);
    expect(
      unknownVariables('{client}, {service}, {date}, {time}, {member}, {business}, {link}'),
    ).toEqual([]);
    expect(unknownVariables('{review} {}')).toEqual(['review', '']);
  });

  it('validates: trimmed, line breaks normalised, limits, the first unknown variable', () => {
    expect(validateTemplate({ subject: '  Salut  ', body: '\r\nA\r\n\r\nB\r\n' })).toEqual({
      subject: 'Salut',
      body: 'A\n\nB',
    });
    expect(() => validateTemplate({ subject: '', body: 'x' })).toThrow('required');
    expect(() => validateTemplate({ subject: 'x'.repeat(151), body: 'x' })).toThrow('too_long');
    expect(() => validateTemplate({ subject: 'x', body: ' ' })).toThrow('required');
    expect(() => validateTemplate({ subject: 'x', body: 'Hi {clinet} {foo}' })).toThrow(
      'unknown_variable:clinet',
    );
    expect(() => validateTemplate({ subject: 1, body: 'x' })).toThrow('required');
  });

  it('fills the variables and keeps the paragraphs', () => {
    const out = fillTemplate(
      {
        subject: 'Mulțumim, {client}!',
        body: 'La {business}, {date}, {time}.\n\n\nCu {member}: {link}',
      },
      values,
    );
    expect(out.subject).toBe('Mulțumim, Cristina!');
    expect(paragraphs(out.body)).toEqual([
      'La Salon Aurora, joi, 19 noiembrie, 10:00.',
      'Cu Ioana Pavel: https://app.example/r/aurora/m/x',
    ]);
  });
});
