#!/usr/bin/env node
/**
 * Bulk-download 1h OHLCV CSVs for every ticker in assets.yaml.
 *
 * Run TradingView Desktop with --remote-debugging-port=9222 first
 * (use scripts/launch_tv_debug.bat).
 *
 * Usage:
 *   node scripts/bulk_save_ohlcv.js               # 1h, all tickers
 *   node scripts/bulk_save_ohlcv.js --tf 60       # explicit timeframe
 *   node scripts/bulk_save_ohlcv.js --limit 10    # just first 10 (for dry-run)
 *   node scripts/bulk_save_ohlcv.js --start 100   # resume from index 100
 *   node scripts/bulk_save_ohlcv.js --pages 30    # max pagination iterations per symbol
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setSymbol, setTimeframe } from '../src/core/chart.js';
import { saveOhlcv } from '../src/core/data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const ASSETS_PATH = join(ROOT, 'assets.yaml');
const OHLCV_DIR = join(ROOT, 'OHLCV');
const LOG_PATH = join(OHLCV_DIR, '_bulk_run.log');

function parseArgs(argv) {
  const args = { tf: '60', limit: 0, start: 0, pages: 60, settle: 700 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (k === 'tf') { args.tf = String(v); i++; }
    else if (k === 'limit') { args.limit = Number(v); i++; }
    else if (k === 'start') { args.start = Number(v); i++; }
    else if (k === 'pages') { args.pages = Number(v); i++; }
    else if (k === 'settle') { args.settle = Number(v); i++; }
  }
  return args;
}

function readTickers() {
  const raw = readFileSync(ASSETS_PATH, 'utf8');
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^- ticker:\s*['"]?([^'"\s]+)['"]?\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

// Best-effort Yahoo → TradingView symbol mapping. Many will resolve verbatim
// (TV's setSymbol is forgiving); the special-cases below cover the common ones.
function yahooToTradingView(t) {
  // Indices / unmappable
  if (t.startsWith('^')) return null;

  // Crypto: BTC-USD → BITSTAMP:BTCUSD (fall back to literal if unknown)
  let m = t.match(/^([A-Z0-9]+)-USD$/);
  if (m) {
    const base = m[1];
    const stable = ['BTC', 'ETH', 'XRP', 'LTC', 'BCH'];
    if (stable.includes(base)) return `BITSTAMP:${base}USD`;
    return `BINANCE:${base}USDT`;
  }

  // FX: EURUSD=X → FX:EURUSD
  m = t.match(/^([A-Z]{6})=X$/);
  if (m) return `FX:${m[1]}`;

  // Continuous futures: GC=F → COMEX_MINI:GC1! / COMEX:GC1! ; let TV resolve via name
  m = t.match(/^([A-Z]{1,4})=F$/);
  if (m) return `${m[1]}1!`;

  // Share classes with hyphen: BRK-B → BRK.B
  if (/^[A-Z]+-[A-Z]$/.test(t)) return t.replace('-', '.');

  // Country suffixes
  // .HK Hong Kong: 0857.HK → HKEX:857
  m = t.match(/^0*(\d+)\.HK$/);
  if (m) return `HKEX:${m[1]}`;
  // .KS Korea: 005930.KS → KRX:005930
  m = t.match(/^(\d+)\.KS$/);
  if (m) return `KRX:${m[1]}`;
  // .SS Shanghai: 601939.SS → SSE:601939
  m = t.match(/^(\d+)\.SS$/);
  if (m) return `SSE:${m[1]}`;
  // .SZ Shenzhen
  m = t.match(/^(\d+)\.SZ$/);
  if (m) return `SZSE:${m[1]}`;
  // .T Tokyo: 8058.T → TSE:8058
  m = t.match(/^(\d+)\.T$/);
  if (m) return `TSE:${m[1]}`;
  // .TW Taiwan
  m = t.match(/^(\d+)\.TW$/);
  if (m) return `TWSE:${m[1]}`;
  // .NS NSE India: RELIANCE.NS → NSE:RELIANCE
  m = t.match(/^([A-Z0-9]+)\.NS$/);
  if (m) return `NSE:${m[1]}`;
  // .BO BSE India
  m = t.match(/^([A-Z0-9]+)\.BO$/);
  if (m) return `BSE:${m[1]}`;
  // .PA Paris: MC.PA → EURONEXT:MC
  m = t.match(/^([A-Z0-9]+)\.PA$/);
  if (m) return `EURONEXT:${m[1]}`;
  // .AS Amsterdam
  m = t.match(/^([A-Z0-9]+)\.AS$/);
  if (m) return `EURONEXT:${m[1]}`;
  // .MC Madrid
  m = t.match(/^([A-Z0-9]+)\.MC$/);
  if (m) return `BME:${m[1]}`;
  // .DE / .F Frankfurt: SAP → XETR:SAP, SIE.DE → XETR:SIE, ENR.F → FWB:ENR
  m = t.match(/^([A-Z0-9]+)\.DE$/);
  if (m) return `XETR:${m[1]}`;
  m = t.match(/^([A-Z0-9]+)\.F$/);
  if (m) return `FWB:${m[1]}`;
  // .MI Milan
  m = t.match(/^([A-Z0-9]+)\.MI$/);
  if (m) return `MIL:${m[1]}`;
  // .ST Stockholm: INVE-B.ST → OMXSTO:INVE_B
  m = t.match(/^([A-Z0-9]+)-([A-Z])\.ST$/);
  if (m) return `OMXSTO:${m[1]}_${m[2]}`;
  m = t.match(/^([A-Z0-9]+)\.ST$/);
  if (m) return `OMXSTO:${m[1]}`;
  // .CO Copenhagen
  m = t.match(/^([A-Z0-9]+)\.CO$/);
  if (m) return `OMXCOP:${m[1]}`;
  // .LS Lisbon
  m = t.match(/^([A-Z0-9]+)\.LS$/);
  if (m) return `EURONEXT:${m[1]}`;
  // .VI Vienna
  m = t.match(/^([A-Z0-9]+)\.VI$/);
  if (m) return `VIE:${m[1]}`;
  // .TO Toronto
  m = t.match(/^([A-Z0-9]+)\.TO$/);
  if (m) return `TSX:${m[1]}`;
  // .SR Saudi
  m = t.match(/^(\d+)\.SR$/);
  if (m) return `TADAWUL:${m[1]}`;
  // .SA São Paulo: ARNC34.SA → BMFBOVESPA:ARNC34
  m = t.match(/^([A-Z0-9]+)\.SA$/);
  if (m) return `BMFBOVESPA:${m[1]}`;

  // Otherwise pass through; TradingView's symbol resolver often accepts US tickers verbatim.
  return t;
}

function log(line) {
  const stamp = new Date().toISOString();
  const s = `[${stamp}] ${line}\n`;
  process.stdout.write(s);
  try { appendFileSync(LOG_PATH, s); } catch {}
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(OHLCV_DIR, { recursive: true });

  const tickers = readTickers();
  log(`Found ${tickers.length} tickers in assets.yaml`);

  let slice = tickers.slice(args.start);
  if (args.limit > 0) slice = slice.slice(0, args.limit);
  log(`Processing ${slice.length} tickers (start=${args.start}, limit=${args.limit || 'all'}, tf=${args.tf})`);

  const summary = { ok: 0, skipped: 0, failed: 0, failures: [] };

  for (let i = 0; i < slice.length; i++) {
    const yahoo = slice[i];
    const tv = yahooToTradingView(yahoo);
    const idx = args.start + i;

    if (!tv) {
      log(`[${idx}/${tickers.length}] SKIP ${yahoo} — no TradingView mapping`);
      summary.skipped++;
      continue;
    }

    try {
      log(`[${idx}/${tickers.length}] ${yahoo} → ${tv} ...`);
      const res = await saveOhlcv({ symbol: tv, timeframe: args.tf, max_iterations: args.pages, settle_ms: args.settle });
      log(`  ✔ ${res.bar_count} bars (${res.period.from_iso} → ${res.period.to_iso}) → ${res.file}`);
      summary.ok++;
    } catch (err) {
      log(`  ✖ FAILED: ${err.message}`);
      summary.failed++;
      summary.failures.push({ yahoo, tv, error: err.message });
    }
  }

  log(`Done. ok=${summary.ok} skipped=${summary.skipped} failed=${summary.failed}`);
  if (summary.failures.length > 0) {
    const failPath = join(OHLCV_DIR, '_failures.json');
    writeFileSync(failPath, JSON.stringify(summary.failures, null, 2));
    log(`Failure list written to ${failPath}`);
  }
  process.exit(0);
}

main().catch((e) => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
