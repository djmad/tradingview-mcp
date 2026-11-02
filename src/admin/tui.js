import readline from 'node:readline';
import { allTools, loadConfig, saveEnv, configToEnv, isToolEnabled, toolKind } from '../permissions.js';

const ESC = '\x1b[';
const reset = `${ESC}0m`;
const bold = `${ESC}1m`;
const dim = `${ESC}2m`;
const inv = `${ESC}7m`;
const green = `${ESC}32m`;
const red = `${ESC}31m`;
const yellow = `${ESC}33m`;
const cyan = `${ESC}36m`;

export function runTui() {
  const cfg = loadConfig();
  const tools = allTools();
  let cursor = 0;
  let dirty = false;
  let status = '';
  let confirmingQuit = false;

  const stdout = process.stdout;
  const stdin = process.stdin;

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
    cfg.mode = mode;
    if (mode === 'custom') {
      cfg.enabled = new Set(tools.filter((t) => !cfg.disabled.has(t.name)).filter((t) => mode !== 'custom' || true).map((t) => t.name));
    }
    cfg.disabled = new Set();
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
    stdout.write(`   ${dim}[r]ead [w]rw [c]ustom  space=toggle  s=save  q=quit${reset}\n`);
    stdout.write(`${dim}${'─'.repeat(72)}${reset}\n`);

    const rows = stdout.rows || 30;
    const viewport = Math.max(8, rows - 8);
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
    saveEnv(configToEnv(cfg));
    dirty = false;
    status = `${green}Saved to .env${reset}`;
  }

  function quit(code = 0) {
    stdout.write(`${ESC}?25h`);
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\n');
    process.exit(code);
  }

  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdout.write(`${ESC}?25l`);

  stdin.on('keypress', (str, key) => {
    if (!key) return;
    status = '';
    if (key.ctrl && key.name === 'c') quit(0);
    if (key.name === 'up') cursor = Math.max(0, cursor - 1);
    else if (key.name === 'down') cursor = Math.min(tools.length - 1, cursor + 1);
    else if (key.name === 'pageup') cursor = Math.max(0, cursor - 10);
    else if (key.name === 'pagedown') cursor = Math.min(tools.length - 1, cursor + 10);
    else if (key.name === 'home') cursor = 0;
    else if (key.name === 'end') cursor = tools.length - 1;
    else if (str === ' ') toggleOne(tools[cursor].name);
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
