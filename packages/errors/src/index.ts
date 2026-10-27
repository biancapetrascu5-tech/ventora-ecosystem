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
