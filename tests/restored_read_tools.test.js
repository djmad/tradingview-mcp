import { it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { getNewsContent } from '../src/core/news.js';
import { getStrategyResults, getTrades, getEquity } from '../src/core/data.js';

it('encodes news article language and ID as data, never as page code', async () => {
  const hostile = "en';globalThis.changed=true;//";
  let requested;
  const sandbox = {
    encodeURIComponent,
    fetch: async url => {
      requested = url;
      return { ok: true, json: async () => ({ title: 'Test', body: 'Body' }) };
    },
  };
  const result = await getNewsContent({ id: hostile, lang: hostile, _deps: {
    evaluateAsync: expression => vm.runInNewContext(expression, sandbox),
  } });
  assert.equal(result.success, true);
  assert.equal(sandbox.changed, undefined);
  assert.equal(new URL(requested).searchParams.get('id'), hostile);
  assert.equal(new URL(requested).searchParams.get('lang'), hostile);
});

it('strategy read tools do not open panels or unhide studies with upstream report discovery', async () => {
  let changed = false;
  const strategy = {
    metaInfo: () => ({ isTVScriptStrategy: true, description: 'Hidden strategy' }),
    reportData: () => null,
    ordersData: () => [],
    properties: () => ({ visible: { value: () => false, setValue: () => { changed = true; } } }),
  };
  const sandbox = { window: {
    TradingView: { bottomWidgetBar: { showWidget: () => { changed = true; } } },
    TradingViewApi: { _activeChartWidgetWV: { value: () => ({
      _chartWidget: { model: () => ({ model: () => ({ dataSources: () => [strategy] }) }) },
    }) } },
  } };
  const _deps = { evaluate: expression => vm.runInNewContext(expression, sandbox) };
  for (const read of [getStrategyResults, getTrades, getEquity]) {
    const result = await read({ _deps });
    assert.equal(result.success, false);
    assert.equal(changed, false);
  }
});
