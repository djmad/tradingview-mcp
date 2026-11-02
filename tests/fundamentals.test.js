import { it } from 'node:test';
import assert from 'node:assert/strict';
import { scannerFetch, resolveSymbol } from '../src/core/fundamentals.js';

it('falls back from Desktop CORS failure to a bounded public scanner request without cookies', async () => {
  const result = await scannerFetch('NASDAQ:AAPL', ['close'], 'NASDAQ', 'stock', {
    evaluateAsync: async () => ({ error: 'Failed to fetch' }),
    fetch: async (url, options) => {
      assert.equal(url, 'https://scanner.tradingview.com/america/scan');
      assert.equal(options.credentials, undefined);
      assert.equal(options.headers.Cookie, undefined);
      assert.ok(options.signal);
      assert.deepEqual(JSON.parse(options.body), { symbols: { tickers: ['NASDAQ:AAPL'] }, columns: ['close'] });
      return { ok: true, json: async () => ({ data: [{ d: [123] }] }) };
    },
  });
  assert.deepEqual(result, { data: { close: 123 } });
});

it('keeps scanner HTTP errors visible instead of reporting empty success', async () => {
  const result = await scannerFetch('NASDAQ:AAPL', ['bad-field'], 'NASDAQ', 'stock', {
    evaluateAsync: async () => ({ error: 'Failed to fetch' }),
    fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: 'Unknown field' }) }),
  });
  assert.match(result.error, /HTTP 400: Unknown field/);
});

it('uses the canonical exchange symbol for a BATS chart feed', async () => {
  const result = await resolveSymbol(undefined, { evaluate: async () => ({
    full_name: 'NASDAQ:AAPL', chart_full_name: 'BATS:AAPL', exchange: 'Cboe One', type: 'stock',
  }) });
  assert.equal(result.full_name, 'NASDAQ:AAPL');
  assert.equal(result.exchange, 'NASDAQ');
});

it('does not reuse active-chart metadata for a different explicit symbol', async () => {
  const result = await resolveSymbol('BINANCE:BTCUSDT', {
    evaluate: async () => ({ full_name: 'NASDAQ:AAPL', chart_full_name: 'BATS:AAPL', type: 'stock' }),
    symbolSearch: async () => ({ results: [{ full_name: 'BINANCE:BTCUSDT', exchange: 'BINANCE', type: 'crypto' }] }),
  });
  assert.equal(result.type, 'crypto');
  assert.equal(result.exchange, 'BINANCE');
  await assert.rejects(resolveSymbol('BTCUSDT', { evaluate: async () => ({ full_name: 'NASDAQ:AAPL' }) }), /SOURCE:TICKER/);
});
