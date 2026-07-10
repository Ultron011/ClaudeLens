// Rough per-million-token USD pricing used only to *estimate* session cost for
// the value panel. These are approximate and easy to update; they are not a
// billing source of truth. Keyed by substring match against the model id.
import type { Usage } from './types.js';

interface Price {
  input: number; // $ / 1M input tokens
  output: number; // $ / 1M output tokens
  cacheWrite: number; // $ / 1M cache-creation tokens
  cacheRead: number; // $ / 1M cache-read tokens
}

// Order matters: first substring match wins.
const TABLE: Array<[string, Price]> = [
  ['opus', { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  ['sonnet', { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ['haiku', { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 }],
  ['fable', { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
];

const DEFAULT: Price = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

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
  const cWrite = usage.cache_creation_input_tokens ?? 0;
  const cRead = usage.cache_read_input_tokens ?? 0;
  return (
    (inTok * p.input +
      outTok * p.output +
      cWrite * p.cacheWrite +
      cRead * p.cacheRead) /
    1_000_000
  );
}
