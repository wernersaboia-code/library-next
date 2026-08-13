import { describe, it, expect } from 'vitest';

describe('ferramental', () => {
  it('resolve o alias @/', async () => {
    const { parseSearchParams } = await import('@/lib/url-state');
    expect(parseSearchParams({ search: 'x' })).toEqual(
      expect.objectContaining({ search: 'x' })
    );
  });
});
