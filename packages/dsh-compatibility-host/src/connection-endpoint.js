import { resolveAdapterOptions } from '@deepseek-ai/dsh-llm-deepseek';

/** Resolve the same dedicated provider endpoint as its native adapter, without saving defaults. */
export function configuredConnectionEndpoint(table, id, environment) {
  const profile = table.find(row => row.ns === 'llm-pi-ai')?.value?.providers?.[id];
  const dedicated = id === 'deepseek-official' ? table.find(row => row.ns === 'llm-deepseek')?.value || {} : undefined;
  return { baseURL: profile?.baseURL || (dedicated ? resolveAdapterOptions(dedicated, environment).baseURL : ''),
    api: profile?.api || (dedicated ? 'deepseek_messages' : 'openai-completions'), headers: profile?.headers || {} };
}

/** Match the official DeepSeek Messages resource root; explicit /v1 is not duplicated. */
export function providerWireBaseURL(connection) {
  if (connection.api !== 'deepseek_messages') return connection.baseURL?.replace(/\/$/, '');
  const base = connection.baseURL?.replace(/\/+$/u, '');
  if (!base) return base;
  return new URL(base).pathname.endsWith('/v1') ? base : `${base}/v1`;
}
