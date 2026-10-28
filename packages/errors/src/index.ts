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
