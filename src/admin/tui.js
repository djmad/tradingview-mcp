import readline from 'node:readline';
import { allTools, loadConfig, saveEnv, configToEnv, isToolEnabled, setPermissionMode, loadAuditConfig } from '../permissions.js';

import { getToolDefinitions } from '../tool-definitions.js';

const ESC = '\x1b[';
const reset = `${ESC}0m`;
const bold = `${ESC}1m`;
const dim = `${ESC}2m`;
const inv = `${ESC}7m`;
const green = `${ESC}32m`;
const red = `${ESC}31m`;
const yellow = `${ESC}33m`;
const cyan = `${ESC}36m`;

export function runTui({ stdin = process.stdin, stdout = process.stdout, onQuit = (code) => process.exit(code), saveSettings = saveEnv } = {}) {
  const cfg = loadConfig();
  let auditEnabled = loadAuditConfig().enabled;
  const definitions = new Map(getToolDefinitions().map(t => [t.name, t]));
  const tools = allTools().map(t => ({ ...t, ...definitions.get(t.name) }));
  let details = false;
  let detailOffset = 0;
  let cursor = 0;
  let dirty = false;
  let status = '';
  let confirmingQuit = false;



  function effectiveEnabled(name) {
    return isToolEnabled(name, cfg);
  }

  function toggleOne(name) {
    const enabled = effectiveEnabled(name);
    if (cfg.mode === 'custom') {
      if (enabled) {
        cfg.enabled.delete(name);
        cfg.disabled.add(name);
      } else {
        cfg.disabled.delete(name);
        cfg.enabled.add(name);
      }
    } else {
      if (enabled) cfg.disabled.add(name);
      else cfg.disabled.delete(name);
    }
    dirty = true;
  }

  function setMode(mode) {
    setPermissionMode(cfg, mode);
    dirty = true;
  }

  function render() {
    stdout.write(`${ESC}2J${ESC}H`);
    const total = tools.length;
    const on = tools.filter((t) => effectiveEnabled(t.name)).length;
    stdout.write(`${bold}TradingView MCP — Permission Admin${reset}  ${dim}(${on}/${total} enabled)${reset}\n`);
    stdout.write(`Mode: `);
    stdout.write(cfg.mode === 'read' ? `${green}${inv} READ ${reset}` : ` read `);
    stdout.write(' ');
    stdout.write(cfg.mode === 'rw' ? `${green}${inv} RW ${reset}` : ` rw `);
    stdout.write(' ');
    stdout.write(cfg.mode === 'custom' ? `${green}${inv} CUSTOM ${reset}` : ` custom `);
    stdout.write(`   ${dim}[r]ead [w]rw [c]ustom  [l]audit=${auditEnabled ? 'on' : 'off'}  space=toggle  enter=details  s=save  q=quit${reset}\n`);
    stdout.write(`${dim}${'─'.repeat(72)}${reset}\n`);

    const rows = stdout.rows || 30;
    const viewport = Math.max(4, rows - 9);
    if (details) {
      const t = tools[cursor];
      const width = Math.max(30, (stdout.columns || 100) - 2);
      const lines = [t.name + ' [' + t.kind + ']', t.description, '', 'Parameters:'];
      for (const [name, schema] of Object.entries(t.parameters || {})) {
        lines.push(name + (schema.isOptional() ? ' (optional)' : ' (required)') + ': ' + (schema.description || ''));
      }
      if (!Object.keys(t.parameters || {}).length) lines.push('(none)');
      const wrapped = lines.flatMap(line => String(line || '').match(new RegExp('.{1,' + width + '}', 'g')) || ['']);
      detailOffset = Math.max(0, Math.min(detailOffset, Math.max(0, wrapped.length - viewport)));
      stdout.write(wrapped.slice(detailOffset, detailOffset + viewport).join('\n') + '\n');
      stdout.write(`${dim}up/down scroll | enter/escape back | space toggle | s save${reset}\n`);
      return;
    }
    const start = Math.max(0, Math.min(cursor - Math.floor(viewport / 2), tools.length - viewport));
    const end = Math.min(tools.length, start + viewport);
    let lastGroup = '';
    for (let i = start; i < end; i++) {
      const t = tools[i];
      const enabled = effectiveEnabled(t.name);
      const mark = enabled ? `${green}[x]${reset}` : `${red}[ ]${reset}`;
      const tag = t.kind === 'read' ? `${cyan}read ${reset}` : `${yellow}write${reset}`;
      const group = t.group !== lastGroup ? t.group.padEnd(11) : ''.padEnd(11);
      lastGroup = t.group;
      const line = `${i === cursor ? '›' : ' '} ${mark} ${tag}  ${group}${t.name}`;
      stdout.write(i === cursor ? `${inv}${line}${reset}\n` : `${line}\n`);
    }
    stdout.write(`${dim}${'─'.repeat(72)}${reset}\n`);
    if (confirmingQuit) {
      stdout.write(`${yellow}Unsaved changes. Press q again to discard, s to save & quit.${reset}\n`);
    } else if (status) {
      stdout.write(`${status}\n`);
    } else {
      stdout.write(`${dim}${dirty ? '● modified' : ' saved'}${reset}\n`);
    }
  }

  function save() {
    saveSettings({ ...configToEnv(cfg), MCP_AUDIT_LOG: auditEnabled ? 'true' : 'false' });
    dirty = false;
    status = `${green}Saved to .env - reconnect to enable tools${reset}`;
  }

  function quit(code = 0) {
    stdout.write(`${ESC}?25h`);
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\n');
    onQuit(code);
  }

  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdout.write(`${ESC}?25l`);

  stdin.on('keypress', (str, key) => {
    if (!key) return;
    status = '';
    if (key.ctrl && key.name === 'c') quit(0);
    if (key.name === 'return' || (details && key.name === 'escape')) { details = !details; detailOffset = 0; }
    else if (details && ['up', 'down', 'pageup', 'pagedown'].includes(key.name)) {
      detailOffset += ({ up: -1, down: 1, pageup: -10, pagedown: 10 })[key.name];
    }
    else if (key.name === 'up') cursor = Math.max(0, cursor - 1);
    else if (key.name === 'down') cursor = Math.min(tools.length - 1, cursor + 1);
    else if (key.name === 'pageup') cursor = Math.max(0, cursor - 10);
    else if (key.name === 'pagedown') cursor = Math.min(tools.length - 1, cursor + 10);
    else if (key.name === 'home') cursor = 0;
    else if (key.name === 'end') cursor = tools.length - 1;
    else if (str === ' ') toggleOne(tools[cursor].name);
    else if (key.name === 'l') { auditEnabled = !auditEnabled; dirty = true; confirmingQuit = false; }
    else if (key.name === 'r') { setMode('read'); confirmingQuit = false; }
    else if (key.name === 'w') { setMode('rw'); confirmingQuit = false; }
    else if (key.name === 'c') { setMode('custom'); confirmingQuit = false; }
    else if (key.name === 's') {
      save();
      if (confirmingQuit) quit(0);
    } else if (key.name === 'q' || key.name === 'escape') {
      if (!dirty) quit(0);
      if (confirmingQuit) quit(0);
      confirmingQuit = true;
    }
    render();
  });

  render();
}
