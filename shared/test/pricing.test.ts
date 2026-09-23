import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costForUsage, priceFor } from '../src/pricing.ts';

const M = 1_000_000;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

// $/MTok [input, output, cacheRead], calibrated against Claude Code's cost-state lines.
const EXPECTED: Array<[string, number, number, number]> = [
  ['claude-opus-5-5', 4, 20, 0.2],
  ['claude-opus-5', 5, 25, 0.5],
  ['claude-opus-4-8', 5, 25, 0.5],
  ['claude-opus-4-5-20251101', 5, 25, 0.5],
  ['claude-opus-4-1-20250805', 15, 75, 1.5],
  ['claude-opus-4-20250514', 15, 75, 1.5],
  ['claude-3-opus-20240229', 15, 75, 1.5],
  ['claude-fable-5-1', 10, 50, 0.25],
  ['claude-sonnet-5', 2, 10, 0.2],
  ['claude-sonnet-4-6', 3, 15, 0.3],
  ['claude-sonnet-4-5-20250929', 3, 15, 0.3],
  ['claude-3-5-sonnet-20241022', 3, 15, 0.3],
  ['claude-haiku-4-5-20251001', 1, 5, 0.1],
  ['claude-3-5-haiku-20241022', 0.8, 4, 0.08],
  ['claude-3-haiku-20240307', 0.25, 1.25, 0.03],
];

for (const [model, input, output, cacheRead] of EXPECTED) {
  test(`pricing: ${model}`, () => {
    assert.deepEqual(priceFor(model), { input, output, cacheRead });
    close(costForUsage(model, { input_tokens: M }), input);
    close(costForUsage(model, { output_tokens: M }), output);
    close(costForUsage(model, { cache_read_input_tokens: M }), cacheRead);
    close(costForUsage(model, { cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: 0 } }), input * 1.25);
    close(costForUsage(model, { cache_creation: { ephemeral_1h_input_tokens: M, ephemeral_5m_input_tokens: 0 } }), input * 2);
  });
}

test('cache writes without a TTL breakdown are priced as 5-minute writes', () => {
  close(costForUsage('claude-sonnet-4-6', { cache_creation_input_tokens: M }), 3.75);
});

test('the TTL breakdown wins over the cache_creation_input_tokens total', () => {
  close(
    costForUsage('claude-opus-5', {
      cache_creation_input_tokens: 2 * M,
      cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: M },
    }),
    5 * 1.25 + 5 * 2,
  );
});

test('web searches cost $10 per 1000', () => {
  close(costForUsage('claude-haiku-4-5', { server_tool_use: { web_search_requests: 7 } }), 0.07);
});

test('unknown models fall back to the default price', () => {
  assert.deepEqual(priceFor('some-new-model'), { input: 3, output: 15, cacheRead: 0.3 });
  assert.deepEqual(priceFor(undefined), { input: 3, output: 15, cacheRead: 0.3 });
});
