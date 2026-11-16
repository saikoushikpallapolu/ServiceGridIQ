import * as oidc from 'openid-client';
import type { Config } from '../config.js';

export interface Identity { issuer: string; subject: string; email: string; name: string; expiresAt: Date }
export interface IdentityProvider {
  authorize(state: string, verifier: string, nonce: string): Promise<string>;
  redeem(url: URL, state: string, verifier: string, nonce: string): Promise<Identity>;
  logoutUrl(): Promise<string>;
}

export function createIdentityProvider(config: Config): IdentityProvider {
  let discovery: Promise<oidc.Configuration> | undefined;
  async function getConfiguration() {
    if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID) throw new Error('Authentication unavailable');
    if (!discovery) {
      const options: oidc.DiscoveryRequestOptions = { timeout: 10, execute: [oidc.enableNonRepudiationChecks] };
      if (config.AUTH_MODE === 'local') {
        options.execute = [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks];
        if (config.OIDC_INTERNAL_ORIGIN) {
          options[oidc.customFetch] = async (input, init) => {
            const url = new URL(input);
            if (url.origin === new URL(config.OIDC_ISSUER!).origin) {
              const target = new URL(config.OIDC_INTERNAL_ORIGIN!);
              url.protocol = target.protocol; url.host = target.host;
            }
            const body = init.body instanceof Uint8Array ? new Uint8Array(init.body).buffer : init.body;
            return fetch(url, { ...init, body });
          };
        }
      }
      discovery = oidc.discovery(new URL(config.OIDC_ISSUER), config.OIDC_CLIENT_ID, undefined,
        config.OIDC_CLIENT_SECRET ? oidc.ClientSecretPost(config.OIDC_CLIENT_SECRET) : oidc.None(), options)
        .catch((error: unknown) => { discovery = undefined; throw error; });
    }
    return discovery;
  }
  return {
    async authorize(state, verifier, nonce) {
      return oidc.buildAuthorizationUrl(await getConfiguration(), {
        redirect_uri: `${config.PUBLIC_ORIGIN}/api/auth/callback`, scope: 'openid email profile',
        state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
      }).href;
    },
    async redeem(url, state, verifier, nonce) {
      const tokens = await oidc.authorizationCodeGrant(await getConfiguration(), url, {
        expectedState: state, expectedNonce: nonce, pkceCodeVerifier: verifier, idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims || claims.iss !== config.OIDC_ISSUER || typeof claims.sub !== 'string' || typeof claims.email !== 'string' || claims.email_verified !== true) throw new Error('Verified identity required');
      return { issuer: claims.iss, subject: claims.sub, email: claims.email.trim().toLowerCase(),
        name: typeof claims.name === 'string' ? claims.name : claims.email, expiresAt: new Date(claims.exp * 1000) };
    },
    async logoutUrl() {
      const settings = await getConfiguration();
      if (!settings.serverMetadata().end_session_endpoint) return config.PUBLIC_ORIGIN;
      return oidc.buildEndSessionUrl(settings, { client_id: config.OIDC_CLIENT_ID!, post_logout_redirect_uri: config.PUBLIC_ORIGIN }).href;
    },
  };
}
