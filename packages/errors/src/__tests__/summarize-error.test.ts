import { describe, expect, it } from 'vitest';
import { Forbidden, InvalidInput, summarizeError } from '../index';

describe('summarizeError', () => {
  it('typed refusals are expected, with their code and status', () => {
    expect(summarizeError(new Forbidden())).toEqual({
      name: 'Forbidden',
      code: 'FORBIDDEN',
      status: 403,
      message: 'Insufficient permissions for this operation',
      expected: true,
    });
    expect(summarizeError(new InvalidInput('ownerEmail')).expected).toBe(true);
  });

  it('a Postgres error keeps its SQLSTATE and is not expected', () => {
    const pg = Object.assign(new Error('invalid input syntax for type uuid: "5giV"'), {
      code: '22P02',
    });
    expect(summarizeError(pg)).toEqual({
      name: 'Error',
      code: '22P02',
      message: 'invalid input syntax for type uuid: "5giV"',
      expected: false,
    });
  });

  it('Better Auth APIError: the HTTP code comes from statusCode', () => {
    const apiError = Object.assign(new Error('Invalid password'), {
      status: 'UNAUTHORIZED',
      statusCode: 401,
    });
    expect(summarizeError(apiError)).toMatchObject({ status: 401, expected: true });
  });

  it('masks e-mail addresses and cuts long messages', () => {
    const s = summarizeError(
      new Error(`duplicate for owner.name+x@example.co.uk; ${'x'.repeat(400)}`),
    );
    expect(s.message).not.toContain('example');
    expect(s.message.startsWith('duplicate for [email]; ')).toBe(true);
    expect(s.message).toHaveLength(300);
  });

  it('non-Error values', () => {
    expect(summarizeError('boom')).toEqual({ name: 'string', message: 'boom', expected: false });
    expect(summarizeError(undefined)).toEqual({
      name: 'undefined',
      message: 'undefined',
      expected: false,
    });
  });
});
