export class NotMemberError extends Error {
  readonly code = 'NOT_MEMBER';
  constructor(message = 'User is not a member of this organization') {
    super(message);
    this.name = 'NotMemberError';
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
