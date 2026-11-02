import { register } from '../router.js';
import * as core from '../../core/alerts.js';

register('alert', {
  description: 'Alert tools (list, create, modify, delete)',
  subcommands: new Map([
    ['list', {
      description: 'List all alerts',
      handler: () => core.list(),
    }],
    ['create', {
      description: 'Create a price alert via the TradingView REST API',
      options: {
        price: { type: 'string', short: 'p', description: 'Price level' },
        condition: { type: 'string', short: 'c', description: 'crossing | crossing_up | crossing_down | greater_than | less_than' },
        message: { type: 'string', short: 'm', description: 'Alert message body (supports {{close}}, {{ticker}}, {{interval}})' },
        name: { type: 'string', short: 'n', description: 'Short alert title' },
        symbol: { type: 'string', short: 's', description: 'Symbol override (default = chart symbol)' },
        resolution: { type: 'string', description: 'Evaluation resolution (default "1")' },
      },
      handler: (opts) => core.create({
        price: Number(opts.price),
        condition: opts.condition || 'crossing',
        message: opts.message,
        name: opts.name,
        symbol: opts.symbol,
        resolution: opts.resolution,
      }),
    }],
    ['modify', {
      description: 'Edit an existing alert by alert_id (only the fields you pass change)',
      options: {
        id: { type: 'string', description: 'alert_id (required)' },
        price: { type: 'string', short: 'p', description: 'New price level' },
        condition: { type: 'string', short: 'c', description: 'New condition' },
        message: { type: 'string', short: 'm', description: 'New message body' },
        name: { type: 'string', short: 'n', description: 'New short title' },
        symbol: { type: 'string', short: 's', description: 'New symbol' },
        resolution: { type: 'string', description: 'New resolution' },
        active: { type: 'boolean', description: 'Set active=true (also restarts a stopped alert)' },
      },
      handler: (opts) => core.modify({
        alert_id: Number(opts.id),
        ...(opts.price != null ? { price: Number(opts.price) } : {}),
        ...(opts.condition ? { condition: opts.condition } : {}),
        ...(opts.message ? { message: opts.message } : {}),
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.symbol ? { symbol: opts.symbol } : {}),
        ...(opts.resolution ? { resolution: opts.resolution } : {}),
        ...(opts.active != null ? { active: opts.active } : {}),
      }),
    }],
    ['delete', {
      description: 'Delete one or more alerts',
      options: {
        id: { type: 'string', description: 'alert_id to delete (repeatable as comma-separated list)' },
        all: { type: 'boolean', description: 'Open the bulk-delete UI fallback' },
      },
      handler: (opts) => {
        if (opts.id) {
          const ids = String(opts.id).split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
          return core.deleteAlerts({ alert_ids: ids });
        }
        return core.deleteAlerts({ delete_all: !!opts.all });
      },
    }],
  ]),
});
