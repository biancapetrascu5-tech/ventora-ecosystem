export class NotAuthenticated extends Error {
  readonly status = 401;
  readonly code = 'NOT_AUTHENTICATED';
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'NotAuthenticated';
  }
}

export class NotMember extends Error {
  readonly status = 403;
  readonly code = 'NOT_MEMBER';
  constructor(message = 'User is not a member of this organization') {
    super(message);
    this.name = 'NotMember';
  }
}

export class AppNotEnabled extends Error {
  readonly status = 403;
  readonly code = 'APP_NOT_ENABLED';
  constructor(message = 'Application is not enabled for this organization') {
    super(message);
    this.name = 'AppNotEnabled';
  }
}

export class Forbidden extends Error {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'Insufficient permissions for this operation') {
    super(message);
    this.name = 'Forbidden';
  }
}

export class ResourceNotFound extends Error {
  readonly status = 404;
  readonly code = 'RESOURCE_NOT_FOUND';
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'ResourceNotFound';
  }
}

export class TwoFactorRequired extends Error {
  readonly status = 403;
  readonly code = 'TWO_FACTOR_REQUIRED';
  constructor(message = 'Two-factor authentication required for this operation') {
    super(message);
    this.name = 'TwoFactorRequired';
  }
}

/** A required field is missing or out of range. `field` names it for the form. */
export class InvalidInput extends Error {
  readonly status = 400;
  readonly code = 'INVALID_INPUT';
  readonly field: string;
  constructor(field: string, message = `Invalid value for ${field}`) {
    super(message);
    this.name = 'InvalidInput';
    this.field = field;
  }
}

/** The operation clashes with the current state (e.g. a support session already open). */
export class Conflict extends Error {
  readonly status = 409;
  readonly code = 'CONFLICT';
  constructor(message = 'The operation conflicts with the current state') {
    super(message);
    this.name = 'Conflict';
  }
}

/**
 * Owner recovery (PROCEDURA-RECUPERARE-OWNER §4): the identity checks do not meet the rule —
 * at least two, and (b) + (c) when the account address is compromised. Nothing was changed.
 */
export class RecoveryVerificationsInvalid extends Error {
  readonly status = 400;
  readonly code = 'RECOVERY_VERIFICATIONS_INVALID';
  readonly rule: 'invalid_value' | 'min_two' | 'compromised_requires_b_and_c';
  constructor(rule: RecoveryVerificationsInvalid['rule'], message = `Recovery checks: ${rule}`) {
    super(message);
    this.name = 'RecoveryVerificationsInvalid';
    this.rule = rule;
  }
}

/** Too many wrong two-factor codes (R-2F5): locked until `lockedUntil` (ISO), for the screen. */
export class TwoFactorLocked extends Error {
  readonly status = 429;
  readonly code = 'TWO_FACTOR_LOCKED';
  readonly lockedUntil: string;
  constructor(lockedUntil: Date, message = 'Too many wrong codes, try again later') {
    super(message);
    this.name = 'TwoFactorLocked';
    this.lockedUntil = lockedUntil.toISOString();
  }
}

/**
 * Lot 3.2 (ARCHITECTURE §8.1, requireFeature): the feature is not in the organization's effective
 * plan (version + add-ons + exceptions + trials). Checking never consumes a quota.
 */
export class FeatureNotIncluded extends Error {
  readonly status = 403;
  readonly code = 'FEATURE_NOT_INCLUDED';
  readonly featureKey: string;
  constructor(featureKey: string, message = `Feature not included: ${featureKey}`) {
    super(message);
    this.name = 'FeatureNotIncluded';
    this.featureKey = featureKey;
  }
}

/**
 * Lot 3.1 (ARCHITECTURE §8.4): Founder can set values only for keys a manifest declares. The key
 * is not in the commercial registry, or was retired from its manifest. Nothing was written.
 */
export class UnknownCommercialKey extends Error {
  readonly status = 400;
  readonly code = 'UNKNOWN_COMMERCIAL_KEY';
  readonly keys: string[];
  constructor(keys: string[], message = `Unknown or retired commercial keys: ${keys.join(', ')}`) {
    super(message);
    this.name = 'UnknownCommercialKey';
    this.keys = keys;
  }
}

/**
 * Lot 2.8 (D3-20, varianta a): the organization is suspended from Founder. Nobody in it gets in,
 * not even to read; the data stays and Founder can reactivate it. Support sessions still work.
 */
export class OrganizationSuspended extends Error {
  readonly status = 403;
  readonly code = 'ORGANIZATION_SUSPENDED';
  constructor(message = 'The organization is suspended') {
    super(message);
    this.name = 'OrganizationSuspended';
  }
}

const EMAIL_IN_TEXT = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/g;

/** A caught error, reduced to what may go into a log or to Sentry. */
export interface ErrorSummary {
  name: string;
  code?: string;
  status?: number;
  /** The message, with e-mail addresses masked and cut at 300 characters. */
  message: string;
  /** A typed refusal (4xx: wrong code, no right, invalid input) that the screen already shows. */
  expected: boolean;
}

/**
 * For the server log: the error's class, code (ours, Postgres SQLSTATE, Better Auth) and message,
 * without personal data. Better Auth's APIError carries the HTTP code in `statusCode`.
 */
export function summarizeError(err: unknown): ErrorSummary {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status =
    typeof e.status === 'number'
      ? e.status
      : typeof e.statusCode === 'number'
        ? e.statusCode
        : undefined;
  const code =
    typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code) : undefined;
  const raw = err instanceof Error ? err.message : String(err);
  return {
    name: err instanceof Error ? err.name : typeof err,
    ...(code !== undefined ? { code } : {}),
    ...(status !== undefined ? { status } : {}),
    message: raw.replace(EMAIL_IN_TEXT, '[email]').slice(0, 300),
    expected: status !== undefined && status >= 400 && status < 500,
  };
}
