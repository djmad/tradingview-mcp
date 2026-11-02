# TradingView MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Version](https://img.shields.io/badge/MCP-1.12.1-orange.svg)](https://modelcontextprotocol.io)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D_18.0.0-green.svg)](https://nodejs.org)

An unofficial Model Context Protocol (MCP) bridge for **TradingView Desktop** via Chrome DevTools Protocol (CDP). It allows AI agents (like Claude Desktop, Cursor, Windsurf, and custom MCP clients) to interact directly with your TradingView charts, retrieve historical/real-time market data, automate drawing and alerts, and manage Pine Script development.

> [!WARNING]  
> **Disclaimer:** This project is unofficial and not affiliated, associated, authorized, endorsed by, or in any way officially connected with TradingView Inc. or Anthropic PBC. Use is subject to TradingView's Terms of Use.

---

## 🌟 Key Features

* **Chrome DevTools Protocol (CDP) Bridge:** Connects to TradingView Desktop (running on debug port `9222`) to inspect and execute JS expressions directly in the application runtime.
* **70+ Integrated Tools:** Comprehensive APIs grouped by function:
  * **Health & Discovery:** Discover available API paths, inspect UI states, and launch TradingView Desktop.
  * **Chart Control:** Switch symbols, adjust timeframes, scroll to specific dates, and zoom visible ranges.
  * **Data APIs:** Fetch real-time quotes, order book depth, OHLCV bars, strategy backtest metrics, individual trades, and equity curve data points.
  * **Pine Script Studio:** Read/write source code in Monaco, compile scripts, catch markers (errors/warnings), and query console outputs.
  * **Annotating & Drawing:** Draw shapes (trend lines, horizontal lines) and place text labels programmatically.
  * **Watchlist & Alerts:** Get/add watchlist symbols and list/create/modify/delete price/study alerts.
  * **Layout & Navigation:** Switch tab layouts, split screens, and manage multi-pane setups.
  * **Replay practice & Batching:** Step through historical data via replay and run batch requests across multiple symbols.
* **Interactive Rights Management (TUI):** Console-based Terminal UI (`node src/server.js --admin`) to manage tool permissions and toggle read/write features in real time.
* **Feature-Rich CLI:** Command-line tool (`tv`) that exposes all 70 MCP server tools as pipe-friendly UNIX-like commands outputting formatted JSON.
* **Multiple Transports:** Supports `stdio`, current MCP Streamable HTTP, and legacy HTTP+SSE.
* **Live Activity TUI:** `npm start` shows server health, sessions, HTTP requests, active tool calls, errors, and TradingView/CDP connectivity.

---

## ⚡ Quick Start

### 1. Launch TradingView in Debug Mode

To allow connection via CDP, TradingView Desktop must be running with remote debugging enabled on port `9222`.

* **Windows (PowerShell):**
  ```powershell
  .\scripts\launch_tv_debug.bat
  ```
* **macOS (Terminal):**
  ```bash
  ./scripts/launch_tv_debug_mac.sh
  ```
* **Linux (Terminal):**
  ```bash
  ./scripts/launch_tv_debug_linux.sh
  ```

### 2. Install Dependencies

Clone the repository and install Node.js dependencies:
```bash
npm install
```

### 3. Run the MCP Server

You can run the server in different modes depending on your transport requirements:

* **Streamable HTTP with live activity TUI (recommended for Codex):**
  ```bash
  npm start
  ```
  Configure the MCP URL as `http://127.0.0.1:3333/mcp`.
* **Legacy HTTP+SSE with live activity TUI:**
  ```bash
  npm start sse
  ```
  Legacy clients connect to `http://127.0.0.1:3333/sse`.
* **Standard Stdio Mode:**
  ```bash
  npm run stdio
  ```
* **Permission Administration Interface (TUI):**
  ```bash
  node src/server.js --admin
  ```

### 4. Run the CLI Client

Execute tools from your command line. The output is JSON, making it perfect for pairing with `jq`:
```bash
# Register the tv command globally (optional)
npm link

# Run health check
tv health check

# Get current chart symbol & timeframe
tv chart state

# Compile a Pine script from stdin
cat strategy.pine | tv pine check
```

---

## 📂 Documentation Directory

To understand, configure, or contribute to this project, please explore our detailed documentation:

### Developer Documentation
* 🚀 **[Setup Guide](docs/setup_guide.md):** Step-by-step instructions to prepare your machine, resolve sandbox limitations, and launch debug targets.
* 🏗️ **[Architecture Overview](docs/architecture.md):** CDP hook architecture, Monaco Editor fiber node traversal, data flows, and trust boundaries.
* ⚙️ **[Configuration Reference](docs/configuration.md):** Environment variables, permissions catalog, and read/write security modes.
* 🔌 **[API Reference](docs/api_reference.md):** Command documentation for the `tv` CLI and schema reference for all 70 MCP tools.
* 📝 **[OpenAPI 3.0 Specification](docs/openapi.yaml):** API definitions for the HTTP / SSE server transport.
* 🤝 **[Contributing Guide](docs/contributing.md):** Project structure, testing practices, and coding conventions.

### User Documentation
* 📖 **[User Guide & LLM Integration](docs/user_guide.md):** Instructions for configuring Claude Desktop, Cursor, or Windsurf to automate technical analysis.
* 🔧 **[FAQ & Troubleshooting](docs/faq_troubleshooting.md):** Resolutions for common connection issues, MSIX UWP sandboxing, and Monaco detection errors.
* 📜 **[Release Notes](docs/release_notes.md):** Version history, improvements, and stability updates.

### Operational Runbooks (docs/runbooks/)
* 📦 **[Installing Classic Desktop Build](docs/runbooks/install_classic_desktop.md):** Bypass Windows UWP Store app argument-stripping rules.
* 📡 **[Troubleshooting CDP Connection](docs/runbooks/troubleshoot_connection.md):** Resolve port 9222 connection issues and connection drops.
* 🔑 **[Managing Permissions via TUI](docs/runbooks/managing_permissions_tui.md):** Configure security levels and toggle individual tool access.

---

## ⚖️ License

This codebase is licensed under the [MIT License](LICENSE).
Created and maintained for advanced algorithmic trading research.
