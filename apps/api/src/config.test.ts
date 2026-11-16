import { expect, it } from 'vitest';
import { parseConfig } from './config.js';

it('rejects invalid environment configuration without exposing its values', () => {
  expect(() => parseConfig({ DATABASE_URL: 'secret-password', PORT: '-1' })).toThrow('DATABASE_URL');
  expect(() => parseConfig({ DATABASE_URL: 'secret-password' })).not.toThrow('secret-password');
});
