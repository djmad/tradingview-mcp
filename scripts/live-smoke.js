// Explicit, opt-in integration check. Only the user's disposable layout named "temp" is accepted.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHttp } from '../src/server.js';
import { evaluate, disconnect } from '../src/connection.js';

const receipts = [];
const snapshot = () => evaluate(`(() => {
  const chart=window.TradingViewApi._activeChartWidgetWV.value();
  const collection=window.TradingViewApi._chartWidgetCollection;
  return { name:collection.metaInfo.name.value(), symbol:chart.symbolExt().full_name,
    resolution:chart.resolution(), chartType:chart.chartType(),
    studies:chart.getAllStudies(), shapes:chart.getAllShapes() };
})()`);
const before = await snapshot();
assert.equal(before.name, 'temp', 'Live mutation checks require the disposable temp layout');
const previousMode = process.env.MCP_PERM_MODE;
const previousDisabled = process.env.MCP_PERM_DISABLED;
process.env.MCP_PERM_MODE = 'rw';
const port = Number(process.env.MCP_SMOKE_PORT || 3334);
const running = await startHttp({ host: '127.0.0.1', port, tui: false, transport: 'mcp' });
const client = new Client({ name: 'fork-live-smoke', version: '2.1.0' });
let createdShape;
let failure;
const connect = c => c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const value = JSON.parse(result.content.find(c => c.type === 'text').text);
  receipts.push({ tool: name, isError: Boolean(result.isError), result: value });
  assert.ok(!result.isError && value.success !== false, `${name}: ${JSON.stringify(value)}`);
  console.log(`PASS ${name}`);
  return value;
}
try {
  await connect(client);
  const tools = await client.listTools();
  console.log(`Registered tools: ${tools.tools.length}`);
  await call('tv_health_check');
  await call('chart_get_state');
  const quote = await call('quote_get');
  await call('data_get_ohlcv', { count: 10, summary: true });
  await call('symbol_data_available');
  await call('data_get_technicals');
  const financials = await call('data_get_financials', { section: 'overview' });
  await call('news_get', { symbol: financials.symbol, count: 3 });
  await call('data_get_study_values');
  const shape = await call('draw_shape', { shape: 'horizontal_line', point: { time: quote.time, price: quote.close }, text: 'MCP smoke test' });
  assert.ok(shape.entity_id, 'Drawing must return its actual ID');
  createdShape = shape.entity_id;
  await call('draw_get_properties', { entity_id: createdShape });
  await call('draw_remove_one', { entity_id: createdShape });
  createdShape = null;
  await call('chart_set', { timeframe: before.resolution === 'D' ? '60' : 'D' });
  await call('chart_set', { timeframe: before.resolution });

  process.env.MCP_PERM_DISABLED = 'ui_evaluate';
  const denied = await client.callTool({ name: 'ui_evaluate', arguments: { expression: 'throw new Error("must not execute")' } });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /Permission denied/);
  console.log('PASS active-session permission revocation');
  delete process.env.MCP_PERM_DISABLED;
  process.env.MCP_PERM_MODE = 'read';
  const readClient = new Client({ name: 'fork-read-smoke', version: '2.1.0' });
  try {
    await connect(readClient);
    const readTools = await readClient.listTools();
    assert.ok(readTools.tools.some(t => t.name === 'data_get_financials'));
    assert.ok(!readTools.tools.some(t => ['chart_set', 'strategy_prepare', 'ui_evaluate'].includes(t.name)));
    console.log(`PASS read-only catalog (${readTools.tools.length} tools)`);
  } finally { await readClient.close(); }
} catch (error) { failure = error; }
finally {
  process.env.MCP_PERM_MODE = 'rw';
  delete process.env.MCP_PERM_DISABLED;
  if (createdShape) await call('draw_remove_one', { entity_id: createdShape }).catch(e => { failure ||= e; });
  const current = await snapshot();
  if (current.resolution !== before.resolution) await call('chart_set', { timeframe: before.resolution }).catch(e => { failure ||= e; });
  const after = await snapshot();
  try { assert.deepEqual(after, before); console.log('PASS chart restored to initial state'); }
  catch (error) { failure ||= error; }
  writeFileSync(new URL('../../live-results.json', import.meta.url), JSON.stringify({ before, after, receipts, error: failure?.message }, null, 2));
  await client.close();
  await running.shutdown();
  await disconnect();
  for (const [key, value] of [['MCP_PERM_MODE', previousMode], ['MCP_PERM_DISABLED', previousDisabled]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
if (failure) throw failure;
