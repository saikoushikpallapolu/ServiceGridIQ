import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseConfig } from '../config.js';
import { createIdentityProvider, type IdentityProvider } from './oidc.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: wrongKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
let issuer = '';
let provider: IdentityProvider;
let mode = 'valid';
let lastVerifier = '';
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/.well-known/openid-configuration') {
    res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] }));
  } else if (req.url === '/jwks') res.end(JSON.stringify({ keys: [publicJwk] }));
  else if (req.url === '/token') {
    let body = ''; for await (const chunk of req) body += String(chunk);
    lastVerifier = new URLSearchParams(body).get('code_verifier') ?? '';
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: mode === 'issuer' ? 'https://wrong.example' : issuer, sub: 'verified-user', aud: mode === 'audience' ? 'wrong-client' : 'test-client', exp: mode === 'expired' ? now - 1000 : now + 900, iat: now,
      nonce: mode === 'nonce' ? 'wrong-nonce' : 'expected-nonce', email: 'identity@example.test', email_verified: mode !== 'email', name: 'Identity test' };
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const unsigned = `${head}.${payload}`;
    const signature = sign('RSA-SHA256', Buffer.from(unsigned), mode === 'signature' ? wrongKey : privateKey).toString('base64url');
    res.end(JSON.stringify({ access_token: 'unused-access-token', token_type: 'Bearer', expires_in: 900, id_token: `${unsigned}.${signature}` }));
  } else { res.statusCode = 404; res.end('{}'); }
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test identity server not started');
  issuer = `http://127.0.0.1:${address.port}`;
  provider = createIdentityProvider(parseConfig({ DATABASE_URL: 'postgresql://local:local@localhost/db', AUTH_MODE: 'local', PUBLIC_ORIGIN: 'http://localhost:8080', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'test-client' }));
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
const redeem = () => provider.redeem(new URL('http://localhost:8080/api/auth/callback?code=test&state=expected-state'), 'expected-state', 'test-code-verifier', 'expected-nonce');
describe('OIDC signed identity verification', () => {
  it('uses S256 PKCE, nonce and state, validates a signed identity and sends the verifier', async () => {
    const url = new URL(await provider.authorize('expected-state', 'test-code-verifier', 'expected-nonce'));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('nonce')).toBe('expected-nonce');
    mode = 'valid';
    expect((await redeem()).subject).toBe('verified-user');
    expect(lastVerifier).toBe('test-code-verifier');
  });
  for (const invalid of ['signature', 'issuer', 'audience', 'expired', 'nonce', 'email']) {
    it(`rejects invalid ${invalid}`, async () => { mode = invalid; await expect(redeem()).rejects.toThrow(); });
  }
});
