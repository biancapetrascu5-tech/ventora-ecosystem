import {
  hashPassword as baHashPassword,
  verifyPassword as baVerifyPassword,
} from 'better-auth/crypto';
import { APIError } from 'better-auth';

// min 10 chars enforced by Better Auth minPasswordLength before hash is called
export function validatePasswordPolicy(password: string): void {
  // D5 (29.10.2026): orice literă mare Unicode, inclusiv Ă Â Î Ș Ț, ca bifele din ecrane
  if (!/\p{Lu}/u.test(password)) {
    throw new APIError('BAD_REQUEST', {
      message: 'Parola trebuie să conțină cel puțin o literă mare.',
    });
  }
  if (!/[0-9]/.test(password)) {
    throw new APIError('BAD_REQUEST', {
      message: 'Parola trebuie să conțină cel puțin o cifră.',
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);
  return baHashPassword(password);
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return baVerifyPassword(data);
}
