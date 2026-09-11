import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../resources/dsh/tavily-web-search.mjs';

const originalKey = process.env.ELECKOI_TAVILY_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.ELECKOI_TAVILY_API_KEY;
  else process.env.ELECKOI_TAVILY_API_KEY = originalKey;
});

describe('Tavily DSH web provider', () => {
  it('registers into ctx.web and returns normalized safe sources', async () => {
    let provider;
    apply({ web: { registerSearchProvider(value) { provider = value; } } });
    process.env.ELECKOI_TAVILY_API_KEY = 'tvly-runtime';
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { title: 'Result', url: 'https://example.com/page', content: 'Snippet' },
      { title: 'Unsafe', url: 'file:///private', content: 'Drop me' },
    ] }), { status: 200 }));
    vi.stubGlobal('fetch', request);

    expect(provider.available()).toBe(true);
    await expect(provider.search({ query: 'latest', maxResults: 3 })).resolves.toEqual({
      sources: [{ title: 'Result', url: 'https://example.com/page', snippet: 'Snippet' }],
      truncated: false,
    });
    expect(request).toHaveBeenCalledWith('https://api.tavily.com/search', expect.objectContaining({
      method: 'POST', redirect: 'error',
    }));
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ query: 'latest', max_results: 3 });
  });
});

