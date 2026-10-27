export class NotMemberError extends Error {
  readonly code = 'NOT_MEMBER';
  constructor(message = 'User is not a member of this organization') {
    super(message);
    this.name = 'NotMemberError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class TokenExpiredError extends Error {
  readonly code = 'TOKEN_EXPIRED';
  constructor(message = 'Invitation token has expired or was already used') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class EmailMismatchError extends Error {
  readonly code = 'EMAIL_MISMATCH';
  constructor(message = 'Account email does not match invitation email') {
    super(message);
    this.name = 'EmailMismatchError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'Insufficient permissions for this operation') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class InvalidInvitationStatusError extends Error {
  readonly code = 'INVALID_INVITATION_STATUS';
  constructor(message = 'Invitation cannot be resent in its current status') {
    super(message);
    this.name = 'InvalidInvitationStatusError';
  }
}

export class InvalidSlugError extends Error {
  readonly code = 'INVALID_SLUG';
  constructor(
    message = 'Slug must be 2–63 lowercase alphanumeric characters or hyphens, and cannot start or end with a hyphen',
  ) {
    super(message);
    this.name = 'InvalidSlugError';
  }
}

export class ReservedSlugError extends Error {
  readonly code = 'RESERVED_SLUG';
  constructor(message = 'This slug is reserved and cannot be used') {
    super(message);
    this.name = 'ReservedSlugError';
  }
}

export class InvalidNameError extends Error {
  readonly code = 'INVALID_NAME';
  constructor(message = 'Organization name must be between 1 and 255 characters') {
    super(message);
    this.name = 'InvalidNameError';
  }
}

export class InvalidEmailError extends Error {
  readonly code = 'INVALID_EMAIL';
  constructor(message = 'Email address is not valid') {
    super(message);
    this.name = 'InvalidEmailError';
  }
}
