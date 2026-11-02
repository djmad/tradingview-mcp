import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PROJECT_ROOT, getOutputDirectory, loadOutputPaths, outputPathsToEnv, resolveOutputDirectory, validateOutputDirectory, sanitizeOutputBasename } from '../src/output-paths.js';
import { captureScreenshot } from '../src/core/capture.js';
import { batchRun } from '../src/core/batch.js';
import { saveOhlcv } from '../src/core/data.js';

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tv-output-folders-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function environment(t, updates) {
  const previous = Object.fromEntries(Object.keys(updates).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

const screenshotDeps = { getClient: async () => ({ Page: { captureScreenshot: async () => ({ data: Buffer.from('mock PNG bytes').toString('base64') }) } }) };

it('keeps defaults at the project root and resolves relative paths there without creating directories', t => {
  environment(t, { MCP_SCREENSHOT_DIR: '', MCP_OHLCV_DIR: '' });
  assert.equal(getOutputDirectory('screenshots'), join(PROJECT_ROOT, 'screenshots'));
  assert.equal(getOutputDirectory('ohlcv'), join(PROJECT_ROOT, 'OHLCV'));
  const destination = join(temporary(t), 'not-created');
  outputPathsToEnv({ screenshots: destination, ohlcv: destination });
  assert.equal(existsSync(destination), false);
  assert.equal(resolveOutputDirectory('screenshots', 'relative output'), resolve(PROJECT_ROOT, 'relative output'));
});

it('loads explicit process overrides and rejects control characters, quotes, drive-relative paths and non-text values', () => {
  const settings = loadOutputPaths({ file: { MCP_SCREENSHOT_DIR: 'file-path' }, environment: { MCP_SCREENSHOT_DIR: 'process-path' } });
  assert.equal(settings.screenshots.configured, 'file-path');
  assert.equal(settings.screenshots.override, 'process-path');
  for (const invalid of ['bad\npath', 'bad\rpath', 'bad\0path', '\x1b[2J', 'a"b', 'C:relative', 'D:', 123, null]) {
    assert.throws(() => validateOutputDirectory(invalid));
  }
  assert.equal(validateOutputDirectory('C:\\Screenshots\\'), 'C:\\Screenshots\\');
  assert.equal(validateOutputDirectory('\\\\server\\share\\'), '\\\\server\\share\\');
});

it('roundtrips quoted Windows/UNC paths and preserves unrelated .env bytes, comments and duplicate lines', t => {
  const directory = temporary(t);
  const envPath = join(directory, '.env');
  const original = '# retained comment\r\nUNRELATED=" value "\r\nDUP = first\r\nDUP=second\r\nMCP_SCREENSHOT_DIR=old\r\n';
  writeFileSync(envPath, original);
  const paths = { screenshots: "C:\\Export Folder\\O'Brien #ä\\", ohlcv: '\\\\server\\share\\CSV data\\' };
  const permissionsUrl = pathToFileURL(join(PROJECT_ROOT, 'src/permissions.js')).href;
  const outputUrl = pathToFileURL(join(PROJECT_ROOT, 'src/output-paths.js')).href;
  const script = `import {saveEnv,loadEnv} from ${JSON.stringify(permissionsUrl)}; import {outputPathsToEnv,getOutputDirectory} from ${JSON.stringify(outputUrl)}; saveEnv({...outputPathsToEnv(${JSON.stringify(paths)}),MCP_AUDIT_LOG:'false'}); console.log(JSON.stringify({env:loadEnv(),dir:getOutputDirectory('screenshots')}));`;
  const env = { ...process.env }; delete env.MCP_SCREENSHOT_DIR; delete env.MCP_OHLCV_DIR;
  const output = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, encoding: 'utf8', env }));
  assert.equal(output.env.MCP_SCREENSHOT_DIR, paths.screenshots);
  assert.equal(output.env.MCP_OHLCV_DIR, paths.ohlcv);
  assert.equal(output.env.UNRELATED, ' value ');
  assert.equal(output.dir, resolve(PROJECT_ROOT, paths.screenshots));
  const text = readFileSync(envPath, 'utf8');
  assert.ok(text.startsWith(original.slice(0, original.indexOf('MCP_SCREENSHOT_DIR'))));
  assert.match(text, /MCP_AUDIT_LOG=false\r\n$/);
  assert.equal(existsSync(join(directory, 'screenshots')), false);
});

it('single and batch screenshot exports use the configured folder and reload it for the next write', async t => {
  const root = temporary(t); const first = join(root, 'first shots'); const second = join(root, 'second shots');
  environment(t, { MCP_SCREENSHOT_DIR: first });
  const one = await captureScreenshot({ filename: '../../image', _deps: screenshotDeps });
  assert.equal(one.file_path, join(first, '____image.png'));
  assert.equal(readFileSync(one.file_path, 'utf8'), 'mock PNG bytes');
  process.env.MCP_SCREENSHOT_DIR = second;
  const batch = await batchRun({ symbols: ['IDX:BBCA'], action: 'screenshot', _deps: {
    ...screenshotDeps, evaluate: async () => {}, getChartApi: async () => 'chart', getChartCollection: async () => 'collection',
    waitForChartReady: async () => true, sleep: async () => {},
  } });
  assert.equal(batch.successful, 1);
  assert.equal(resolve(batch.results[0].result.file_path, '..'), second);
  assert.ok(existsSync(batch.results[0].result.file_path));
  assert.ok(!/[<>:"|?*]/.test(batch.results[0].result.file_path.slice(second.length + 1)));
  assert.equal(readFileSync(batch.results[0].result.file_path, 'utf8'), 'mock PNG bytes');
  assert.ok(readdirSync(second).includes(basename(batch.results[0].result.file_path)), 'Batch PNG must be a visible ordinary directory entry, not an NTFS stream');
  const two = await captureScreenshot({ filename: 'next', _deps: screenshotDeps });
  assert.equal(two.file_path, join(second, 'next.png'));
  const colon = await captureScreenshot({ filename: 'chart:name', _deps: screenshotDeps });
  assert.equal(colon.file_path, join(second, 'chart_name.png'));
  assert.ok(readdirSync(second).includes('chart_name.png'));
});

it('native TradingView API screenshots create no configured directory; fallback CDP writes there', async t => {
  const directory = join(temporary(t), 'native-not-created');
  environment(t, { MCP_SCREENSHOT_DIR: directory });
  const native = await captureScreenshot({ method: 'api', _deps: { getChartCollection: async () => 'collection', evaluate: async () => {} } });
  assert.equal(native.method, 'api'); assert.equal(existsSync(directory), false);
  const fallback = await captureScreenshot({ method: 'api', filename: 'fallback', _deps: {
    ...screenshotDeps, getChartCollection: async () => { throw new Error('unsupported'); },
  } });
  assert.equal(fallback.file_path, join(directory, 'fallback.png'));
});

it('OHLCV CSV export uses the current configured directory, including a later changed value', async t => {
  const root = temporary(t);
  environment(t, { MCP_OHLCV_DIR: join(root, 'CSV #ä') });
  const evaluate = async expression => {
    if (expression.includes('bar_count: last - first + 1')) return { bar_count: 1 };
    if (expression.includes('return { symbol: sym, resolution: res }')) return { symbol: 'IDX:BBCA', resolution: 'D' };
    if (expression.includes('out.push([')) return [[1700000000, 1, 3, 1, 2, 100]];
    throw new Error('Unexpected mock operation');
  };
  const options = { max_history: 1, _deps: { evaluate, sleep: async () => {} } };
  const first = await saveOhlcv(options);
  assert.equal(resolve(first.file, '..'), process.env.MCP_OHLCV_DIR);
  assert.match(readFileSync(first.file, 'utf8'), /^time,datetime,open,high,low,close,volume\n/);
  process.env.MCP_OHLCV_DIR = join(root, 'another CSV folder');
  const second = await saveOhlcv(options);
  assert.equal(resolve(second.file, '..'), process.env.MCP_OHLCV_DIR);
  assert.ok(existsSync(second.file));
});

it('existing files are rejected as output folders without changing their contents', async t => {
  const file = join(temporary(t), 'existing.txt'); writeFileSync(file, 'keep');
  assert.throws(() => outputPathsToEnv({ screenshots: file, ohlcv: '' }), /destination is a file/);
  environment(t, { MCP_SCREENSHOT_DIR: file });
  await assert.rejects(captureScreenshot({ _deps: screenshotDeps }), /destination is a file/);
  assert.equal(readFileSync(file, 'utf8'), 'keep');
});

it('a saved .env folder change routes the next actual export without restarting the process', t => {
  const directory = temporary(t);
  const permissionsUrl = pathToFileURL(join(PROJECT_ROOT, 'src/permissions.js')).href;
  const pathsUrl = pathToFileURL(join(PROJECT_ROOT, 'src/output-paths.js')).href;
  const captureUrl = pathToFileURL(join(PROJECT_ROOT, 'src/core/capture.js')).href;
  const first = join(directory, 'first'); const second = join(directory, 'second');
  const script = `import{saveEnv}from${JSON.stringify(permissionsUrl)};import{outputPathsToEnv}from${JSON.stringify(pathsUrl)};import{captureScreenshot}from${JSON.stringify(captureUrl)};const _deps={getClient:async()=>({Page:{captureScreenshot:async()=>({data:'eA=='})}})};saveEnv(outputPathsToEnv({screenshots:${JSON.stringify(first)},ohlcv:''}));const one=await captureScreenshot({filename:'one',_deps});saveEnv(outputPathsToEnv({screenshots:${JSON.stringify(second)},ohlcv:''}));const two=await captureScreenshot({filename:'two',_deps});console.log(JSON.stringify([one.file_path,two.file_path]));`;
  const env = { ...process.env }; delete env.MCP_SCREENSHOT_DIR; delete env.MCP_OHLCV_DIR;
  const output = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, encoding: 'utf8', env }));
  assert.deepEqual(output, [join(first, 'one.png'), join(second, 'two.png')]);
  assert.equal(readFileSync(output[1], 'utf8'), 'x');
});

it('failed atomic configuration replacement preserves the original .env and cleans up its temporary file', t => {
  const directory = temporary(t); const original = '# Keep this\nUNRELATED=" value "\nMCP_SCREENSHOT_DIR="old path"\n';
  writeFileSync(join(directory, '.env'), original);
  const permissionsUrl = pathToFileURL(join(PROJECT_ROOT, 'src/permissions.js')).href;
  const script = `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';fs.renameSync=()=>{throw new Error('mock rename denied')};syncBuiltinESMExports();const{saveEnv}=await import(${JSON.stringify(permissionsUrl)});try{saveEnv({MCP_SCREENSHOT_DIR:'"new path"'});}catch(error){console.log(error.message)}console.log(JSON.stringify(fs.readdirSync('.')));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, encoding: 'utf8' });
  assert.match(output, /mock rename denied/);
  assert.match(output, /\["\.env"\]/);
  assert.equal(readFileSync(join(directory, '.env'), 'utf8'), original);
});

it('keeps screenshot basenames portable and never permits NTFS streams or reserved device names', () => {
  assert.equal(sanitizeOutputBasename('IDX:BBCA'), 'IDX_BBCA');
  assert.equal(sanitizeOutputBasename('../../file:<x>|?*'), '____file__x____');
  assert.equal(sanitizeOutputBasename('CON'), '_CON');
  assert.equal(sanitizeOutputBasename('nul.txt'), '_nul.txt');
  assert.equal(sanitizeOutputBasename('image.  '), 'image');
});
