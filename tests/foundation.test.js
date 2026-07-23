import { describe, expect, it } from 'vitest';

import { applicationName } from '../src/index.js';

describe('backend foundation', () => {
  it('exports the application name', () => {
    expect(applicationName).toBe('client-management-portal-api');
  });
});
