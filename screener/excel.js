/**
 * Formats a scan-YYYY-MM-DD.json result into an .xlsx workbook: one summary
 * sheet plus one flat "Sinyal" sheet (one row per matched criterion) that's
 * easy to sort/filter directly in Excel.
 */
import { writeFile } from 'node:fs/promises';
import { shortCriteriaLabel } from './report.js';

export async function generateExcelBuffer(scan) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'tradingview-mcp screener';
  wb.created = new Date(scan.generated_at);

  const summary = wb.addWorksheet('Ringkasan');
  summary.columns = [{ width: 40 }, { width: 30 }];
  summary.addRows([
    ['Tanggal Screening', scan.generated_at.slice(0, 10)],
    ['Total Saham Dipindai', scan.total_scanned],
    ['Saham dengan Minimal 1 Sinyal', scan.total_matches],
    ['Error', scan.total_errors],
    ['Disaring (Tidak Likuid)', scan.total_skipped_illiquid ?? 'n/a'],
    ['Threshold AvgValTrx 50 Hari (Rp)', scan.min_avg_value_trx_50d ?? 'n/a'],
    ['Durasi (detik)', scan.elapsed_seconds],
    ['Report Scope', 'batch_only; continue next_cursor until done for full snapshot coverage'],
    ['Universe Membership As Of', scan.universe?.as_of || 'Unknown; source does not declare membership date'],
    ['Current Membership Verified', false],
    ['Universe Source', scan.universe?.source || ''],
    ['Source PR Published On', scan.universe?.source_pr_published_on || ''],
    ['Source Revision', scan.universe?.source_revision || ''],
    ['Universe Revision', scan.universe?.revision || ''],
    ['Batch Offset', scan.page?.offset ?? ''],
    ['Batch Processed', scan.page?.processed ?? ''],
    ['Universe Size', scan.page?.total ?? ''],
    ['Universe Scan Done', scan.page?.done ?? false],
    ['Observed Feed / Delay Seconds', (scan.outcomes || []).map(item => `${item.requested_symbol || item.symbol} -> ${item.actual_symbol || 'unknown'} / ${item.delay_seconds ?? 'unknown'}`).join('; ')],
    ['Daily Data As Of UTC', (scan.outcomes || []).map(item => `${item.symbol}: ${Number.isFinite(item.data_asof) ? new Date(item.data_asof * 1000).toISOString() : 'unknown'}`).join('; ')],
    [],
    ['Disclaimer', 'Hasil analisis teknikal terkomputasi berbasis aturan (rule-based), bukan nasihat investasi dari penasihat keuangan berlisensi. Selalu verifikasi ulang secara manual sebelum mengambil keputusan trading.'],
  ]);
  summary.getRow(1).font = { bold: true };
  summary.getColumn(1).font = { bold: true };
  summary.getCell('B9').alignment = { wrapText: true };

  const sheet = wb.addWorksheet('Sinyal');
  sheet.columns = [
    { header: 'Saham', key: 'symbol', width: 10 },
    { header: 'Close', key: 'close', width: 12 },
    { header: 'Kriteria', key: 'criterion', width: 34 },
    { header: 'Buy Area', key: 'buy_area', width: 18 },
    { header: 'Cutloss', key: 'cutloss', width: 12 },
    { header: 'Take Profit 1', key: 'tp1', width: 14 },
    { header: 'Take Profit 2', key: 'tp2', width: 14 },
    { header: 'Extended Target', key: 'extended', width: 16 },
    { header: 'Nearest Resistance', key: 'resistance', width: 18 },
    { header: 'Nearest Support', key: 'support', width: 16 },
    { header: 'Metode', key: 'method', width: 70 },
    { header: 'Data As Of UTC', key: 'data_asof', width: 26 },
    { header: 'Latest Daily Bar May Be Incomplete', key: 'incomplete', width: 22 },
    { header: 'Actual Feed Symbol', key: 'actual_symbol', width: 22 },
    { header: 'Feed Delay Seconds', key: 'delay_seconds', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: 'O1' };

  for (const stock of scan.results) {
    for (const m of stock.matches) {
      sheet.addRow({
        symbol: stock.symbol,
        close: stock.last_close,
        criterion: shortCriteriaLabel(m.criterion),
        buy_area: m.plan?.buy_area ?? '',
        cutloss: m.plan?.cutloss ?? '',
        tp1: m.plan?.take_profit_1 ?? '',
        tp2: m.plan?.take_profit_2 ?? '',
        extended: m.plan?.extended_target ?? '',
        resistance: stock.nearest_resistance ?? '',
        support: stock.nearest_support ?? '',
        method: m.plan?.method ?? '',
        data_asof: Number.isFinite(stock.data_asof) ? new Date(stock.data_asof * 1000).toISOString() : 'unknown',
        incomplete: stock.latest_loaded_bar_may_be_incomplete === undefined ? 'unknown' : Boolean(stock.latest_loaded_bar_may_be_incomplete),
        actual_symbol: stock.actual_symbol || 'unknown',
        delay_seconds: Number.isFinite(stock.delay_seconds) ? stock.delay_seconds : 'unknown',
      });
    }
  }

  return wb.xlsx.writeBuffer();
}

// Exclusive creation avoids overwriting earlier scans or unrelated workbooks.
export async function generateExcel(scan, outputPath) {
  await writeFile(outputPath, await generateExcelBuffer(scan), { flag: 'wx', mode: 0o600 });
  return outputPath;
}
