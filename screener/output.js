import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { generateReport } from './report.js';
import { generateExcelBuffer } from './excel.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function batchMarkdown(scan) {
  return ['# IHSG screener batch', '',
    `Universe membership as-of: ${scan.universe.as_of || 'unknown'}; current membership verified: false.`,
    `Source: ${scan.universe.source}`, `Source PR publication: ${scan.universe.source_pr_published_on}; revision: ${scan.universe.source_revision}`, `Universe revision: ${scan.universe.revision}`,
    `Batch offset: ${scan.page.offset}; processed: ${scan.page.processed}; universe size: ${scan.page.total}.`,
    'This report covers this batch only; repeat next_cursor until done to cover the snapshot universe.',
    `Actual feed/delay: ${scan.outcomes.map(r => `${r.requested_symbol || r.symbol} -> ${r.actual_symbol || 'unknown'}; delay_seconds=${r.delay_seconds ?? 'unknown'}`).join(', ') || '(none)'}.`,
    `Daily loaded-bar timestamps: ${scan.outcomes.map(r => `${r.symbol}=${r.data_asof ?? 'unavailable'}`).join(', ') || '(none)'}.`,
    'Signals are rule-based geometric/volume heuristics; the latest daily bar may still be incomplete.', '',
    generateReport(scan), ''].join('\n');
}

export async function writeBatchReports(scan, { directory = join(ROOT, '.local', 'ihsg') } = {}) {
  const output = resolve(directory);
  // Runtime passes only the fixed project-local directory. Tests use an isolated temp root.
  for (let ancestor = output; ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
    try { if ((await lstat(ancestor)).isSymbolicLink()) throw new Error('Report destination is redirected'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(output, { recursive: true });
  const basename = `ihsg-${scan.generated_at.replace(/[^0-9TZ]/g, '')}-${scan.page.offset}-${randomUUID()}`;
  const files = {};
  try {
    const json = join(output, `${basename}.json`);
    await writeFile(json, JSON.stringify(scan, null, 2), { flag: 'wx', mode: 0o600 }); files.json = json;
    const markdown = join(output, `${basename}.md`);
    await writeFile(markdown, batchMarkdown(scan), { flag: 'wx', mode: 0o600 }); files.markdown = markdown;
    const xlsx = join(output, `${basename}.xlsx`);
    await writeFile(xlsx, await generateExcelBuffer(scan), { flag: 'wx', mode: 0o600 }); files.xlsx = xlsx;
    return { success: true, scope: 'batch_only', files };
  } catch {
    return { success: false, scope: 'batch_only', files, error: 'One or more batch reports could not be created; existing successful outputs were preserved.' };
  }
}
