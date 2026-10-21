import { describe, expect, it } from 'vitest';
import { clientAddress } from './util';

describe('clientAddress', () => {
  it('believes only as many forwarded addresses as there are proxies', () => {
    expect(clientAddress('10.0.0.9', undefined, 0)).toBe('10.0.0.9');
    // Someone sends their own X-Forwarded-For through Cloudflare and a local proxy: only the last two count.
    expect(clientAddress('172.18.0.2', '6.6.6.6, 203.0.113.7, 104.16.0.1', 2)).toBe('203.0.113.7');
    expect(clientAddress('172.18.0.2', '203.0.113.7', 1)).toBe('203.0.113.7');
    // Fewer entries than proxies (a local device straight to the local proxy): the first one.
    expect(clientAddress('172.18.0.2', '192.168.1.20', 2)).toBe('192.168.1.20');
    // Set to trust a proxy that is not there: the direct address.
    expect(clientAddress('192.168.1.20', undefined, 2)).toBe('192.168.1.20');
  });

  it('gives IPv4 in its plain form', () => {
    expect(clientAddress('::ffff:192.168.1.20', undefined, 0)).toBe('192.168.1.20');
    expect(clientAddress('::1', undefined, 0)).toBe('::1');
    expect(clientAddress(undefined, undefined, 0)).toBe('unknown');
  });
});
