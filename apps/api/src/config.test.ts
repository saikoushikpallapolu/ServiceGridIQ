import { expect, it } from 'vitest';
import { parseConfig } from './config.js';

it('rejects invalid environment configuration without exposing its values', () => {
  expect(() => parseConfig({ DATABASE_URL: 'secret-password', PORT: '-1' })).toThrow('DATABASE_URL');
  expect(() => parseConfig({ DATABASE_URL: 'secret-password' })).not.toThrow('secret-password');
});

it('rejects insecure managed OIDC and non-loopback local authentication', () => {
  const base = { DATABASE_URL: 'postgresql://local:local@localhost:5432/servicegrid', OIDC_CLIENT_ID: 'app' };
  expect(() => parseConfig({ ...base, AUTH_MODE: 'oidc', PUBLIC_ORIGIN: 'http://example.com', OIDC_ISSUER: 'https://issuer.example' })).toThrow('HTTPS');
  expect(() => parseConfig({ ...base, AUTH_MODE: 'local', PUBLIC_ORIGIN: 'http://example.com', OIDC_ISSUER: 'http://localhost:8082' })).toThrow('loopback');
});
