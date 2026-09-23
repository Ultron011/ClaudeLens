// Per-million-token USD pricing used to *estimate* session cost. Not a billing source of truth,
// but calibrated against Claude Code's own `cost-state` lines (per-model `costUSD` + token
// counts) on real transcripts — see docs/claude-code-jsonl.md for how to re-derive it.
// Keyed by substring match against the model id.
import type { Usage } from './types.js';

export interface Price {
  input: number; // $ / 1M input tokens
  output: number; // $ / 1M output tokens
  cacheRead: number; // $ / 1M cache-read tokens
}

// Cache writes are priced off `input`: a 5-minute write costs 1.25×, a 1-hour write 2×.
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
/** Server-side web search: $10 per 1,000 requests. */
const WEB_SEARCH_USD = 10 / 1000;

// Order matters: first substring match wins, so specific (legacy / point-release) keys sit above
// the generic family key that would otherwise swallow them.
const TABLE: Array<[string, Price]> = [
  // Legacy Opus generations kept the old $15/$75 price.
  ['claude-3-opus', { input: 15, output: 75, cacheRead: 1.5 }],
  ['opus-4-1', { input: 15, output: 75, cacheRead: 1.5 }],
  ['opus-4-0', { input: 15, output: 75, cacheRead: 1.5 }],
  ['opus-4-2025', { input: 15, output: 75, cacheRead: 1.5 }], // claude-opus-4-20250514
  ['opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['opus', { input: 5, output: 25, cacheRead: 0.5 }], // opus 4.5+ and opus 5
  ['fable', { input: 10, output: 50, cacheRead: 0.25 }],
  ['sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['sonnet', { input: 3, output: 15, cacheRead: 0.3 }], // sonnet 3.x / 4.x
  ['claude-3-haiku', { input: 0.25, output: 1.25, cacheRead: 0.03 }],
  ['3-5-haiku', { input: 0.8, output: 4, cacheRead: 0.08 }],
  ['haiku', { input: 1, output: 5, cacheRead: 0.1 }], // haiku 4.5+
];

const DEFAULT: Price = { input: 3, output: 15, cacheRead: 0.3 };

export function priceFor(model?: string): Price {
  if (!model) return DEFAULT;
  const m = model.toLowerCase();
  for (const [key, price] of TABLE) if (m.includes(key)) return price;
  return DEFAULT;
}

export function costForUsage(model: string | undefined, usage: Usage): number {
  const p = priceFor(model);
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cRead = usage.cache_read_input_tokens ?? 0;
  // Newer API responses split cache writes by TTL; without the breakdown, assume 5-minute.
  const split = usage.cache_creation;
  const has1h = typeof split?.ephemeral_1h_input_tokens === 'number';
  const has5m = typeof split?.ephemeral_5m_input_tokens === 'number';
  const w1h = has1h ? split!.ephemeral_1h_input_tokens! : 0;
  const w5m = has5m || has1h ? (split?.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0);
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return (
    (inTok * p.input +
      outTok * p.output +
      cRead * p.cacheRead +
      w5m * p.input * CACHE_WRITE_5M +
      w1h * p.input * CACHE_WRITE_1H) /
      1_000_000 +
    searches * WEB_SEARCH_USD
  );
}
