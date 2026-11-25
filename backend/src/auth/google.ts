import { OAuth2Client } from 'google-auth-library';
import { HttpError } from '../lib/errors.js';
import type { GoogleVerifier } from '../types.js';

/** Verifies a Google Identity Services ID token (signature, audience = our client id, expiry). */
export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client(clientId);
  return {
    async verify(credential) {
      if (!clientId) throw new HttpError(503, 'Google sign-in is not configured');
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId }).catch(() => {
        throw new HttpError(401, 'Invalid Google credential');
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new HttpError(401, 'Invalid Google credential');
      return {
        sub: p.sub,
        email: p.email,
        name: p.name ?? p.email,
        picture: p.picture,
        emailVerified: p.email_verified === true,
      };
    },
  };
}
