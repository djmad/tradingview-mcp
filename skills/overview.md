# TradingView MCP tool catalog

All 84 registered tools appear below, including disabled tools. The permission TUI (npm run admin; Enter for details) and MCP tools/list expose current parameter descriptions. Tools operate on the requesting session-selected chart, not an arbitrary window. See [README](../README.md) and [approved v2.2 features](../docs/APPROVED_FEATURES.md).

| Tool | Access | Parameters |
|---|---|---|
| `IHSG_Screen` | write | `symbols`, `cursor`, `limit`, `timeout_ms`, `min_avg_value_trx_50d`, `criteria`, `export_reports` |
| `target_list` | read | (none) |
| `target_select` | write | `target_id` |
| `tv_health_check` | read | (none) |
| `tv_discover` | read | (none) |
| `tv_ui_state` | read | (none) |
| `tv_launch` | write | `port`, `kill_existing` |
| `tv_update` | write | (none) |
| `chart_get_state` | read | (none) |
| `chart_get_visible_range` | read | (none) |
| `chart_set` | write | `symbol`, `timeframe`, `chart_type`, `visible_range`, `scroll_to` |
| `chart_manage_indicator` | write | `action`, `indicator`, `entity_id`, `inputs` |
| `add_known_indicator` | write | `indicator_id`, `length` |
| `data_get_equity` | read | (none) |
| `data_get_indicator` | read | `entity_id` |
| `data_get_ohlcv` | read | `count`, `summary` |
| `data_get_pine_graphics` | read | `kinds`, `study_filter`, `max_labels`, `verbose` |
| `data_get_strategy_results` | read | (none) |
| `data_get_study_values` | read | (none) |
| `data_get_trades` | read | `max_trades` |
| `quote_get` | read | `symbol` |
| `depth_get` | read | (none) |
| `symbol_info` | read | (none) |
| `symbol_search` | read | `query`, `type` |
| `data_save_ohlcv` | write | `symbol`, `timeframe`, `max_history`, `max_iterations`, `settle_ms` |
| `strategy_prepare` | write | (none) |
| `data_load_history` | write | `before`, `count`, `max_iterations`, `timeout_ms`, `page_size`, `settle_ms` |
| `pine_list_scripts` | read | (none) |
| `pine_edit` | write | `action`, `allow_title_mismatch`, `source` |
| `pine_new` | write | `type` |
| `pine_open` | write | `name` |
| `draw_get_properties` | read | `entity_id` |
| `draw_list` | read | (none) |
| `draw_shape` | write | `shape`, `point`, `point2`, `overrides`, `text` |
| `draw_clear` | write | (none) |
| `draw_remove_one` | write | `entity_id` |
| `alert_list` | read | (none) |
| `alert_create` | write | `condition`, `price`, `message`, `name`, `symbol`, `resolution`, `popup`, `email`, `mobile_push`, `sms_over_email`, `web_hook`, `sound_file`, `sound_duration`, `expiration` |
| `alert_modify` | write | `alert_id`, `price`, `condition`, `message`, `name`, `symbol`, `resolution`, `popup`, `email`, `mobile_push`, `sms_over_email`, `web_hook`, `active`, `expiration`, `auto_deactivate` |
| `alert_delete` | write | `alert_id`, `alert_ids`, `delete_all` |
| `news_get` | read | `symbol`, `count`, `lang` |
| `news_get_content` | read | `id`, `lang` |
| `symbol_data_available` | read | `symbol` |
| `data_get_technicals` | read | `symbol` |
| `data_get_financials` | read | `symbol`, `section` |
| `data_get_etf_profile` | read | `symbol`, `section` |
| `data_get_seasonals` | read | `symbol`, `years` |
| `capture_screenshot` | read | `region`, `filename`, `method`, `wait_for_render` |
| `indicator_get_style` | read | `entity_id` |
| `indicator_set_inputs` | write | `entity_id`, `inputs` |
| `indicator_toggle_visibility` | write | `entity_id`, `visible` |
| `indicator_search` | write | `query`, `limit` |
| `indicator_add` | write | `query`, `match`, `section` |
| `indicator_set_style` | write | `entity_id`, `overrides` |
| `watchlist_get` | read | (none) |
| `watchlist_get_sections` | read | `list_id` |
| `watchlist_add` | write | `symbol` |
| `watchlist_add_bulk` | write | `symbols` |
| `watchlist_remove` | write | `symbols` |
| `watchlist_create_section` | write | `list_id`, `section`, `expected_revision` |
| `watchlist_move_to_section` | write | `list_id`, `section`, `expected_revision`, `symbols` |
| `layout_list` | read | (none) |
| `layout_switch` | write | `name` |
| `layout_new` | write | `name` |
| `pane_list` | read | (none) |
| `pane_focus` | write | `index` |
| `pane_set_layout` | write | `layout` |
| `pane_set_symbol` | write | `index`, `symbol` |
| `tab_list` | read | (none) |
| `tab_close` | write | (none) |
| `tab_new` | write | `layout`, `name` |
| `tab_switch` | write | `index` |
| `replay` | write | `action`, `date`, `timestamp`, `speed`, `trade_action` |
| `batch_run` | write | `symbols`, `timeframes`, `action`, `delay_ms`, `ohlcv_count` |
| `ui_find_element` | read | `query`, `strategy` |
| `ui_click` | write | `by`, `value` |
| `ui_evaluate` | write | `expression` |
| `ui_fullscreen` | write | (none) |
| `ui_hover` | write | `by`, `value` |
| `ui_keyboard` | write | `key`, `modifiers` |
| `ui_mouse_click` | write | `x`, `y`, `button`, `double_click` |
| `ui_open_panel` | write | `panel`, `action` |
| `ui_scroll` | write | `direction`, `amount` |
| `ui_type_text` | write | `text` |

Workflow guides: [chart analysis](chart-analysis/SKILL.md), [multi-symbol scan](multi-symbol-scan/SKILL.md), [Pine development](pine-develop/SKILL.md), [replay practice](replay-practice/SKILL.md), [strategy report](strategy-report/SKILL.md), [performance analysis](performance-analyst/SKILL.md).
