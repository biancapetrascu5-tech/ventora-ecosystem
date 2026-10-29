/* Ce trece de la un ecran de autentificare la următorul, doar în memoria paginii (navigare client):
   - adresa, din „Intră în cont” spre „Ai uitat parola?” și înapoi (README HubSignIn / HubPasswordReset);
   - parola de la intrare, pentru activarea 2FA la prima intrare a proprietarului: /two-factor/enable
     o cere, iar designul nu mai are un pas cu parola (DE VALIDAT TEHNIC).
   Nimic nu se scrie în storage sau în URL; la reîncărcare se pierde și ecranul cere intrarea din nou. */

type Handoff = { email?: string; password?: string; backupCodeUsed?: boolean };

let state: Handoff = {};

export function setHandoff(next: Handoff): void {
  state = { ...state, ...next };
}

export function readHandoff(): Handoff {
  return state;
}

/** Citește și șterge parola: se folosește o singură dată. */
export function takePassword(): string | undefined {
  const p = state.password;
  state = { ...state, password: undefined };
  return p;
}
