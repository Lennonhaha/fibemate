#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
'use strict';

/**
 * Quarantine legacy rows whose raw_json is not a JSON object.
 *
 * The devices table is a key/value store: `id` plus a JSON payload in
 * `raw_json`. Production contains a handful of rows where the payload is a
 * bare integer, a bare string, or the literal `true` - leftovers from an
 * earlier migration. Every reader does `json_extract(raw_json, '$.isActive')`
 * and gets NULL for those rows, so they are dead weight: they can never be
 * matched to a user, a device key, or an active flag.
 *
 * Deleting rows is irreversible, so this script moves them to
 * `devices_legacy_quarantine` first and only then deletes them from
 * `devices`, in one transaction. Running it twice moves nothing the second
 * time.
 *
 * Usage:
 *   node scripts/cleanup-legacy-rows.cjs --db <path> [--apply] [--json]
 *
 *   (no --apply)  read-only report; the database is opened read-only
 *   --apply       quarantine + delete, in a single transaction
 *   --json        machine-readable output
 *
 * Exit codes:
 *   0  report produced, or apply succeeded
 *   2  usage error
 *   3  preflight failure (db missing, table missing, quick_check not ok)
 *   4  apply failed and was rolled back
 */

const fs = require('fs');

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_PREFLIGHT = 3;
const EXIT_APPLY = 4;

function parseArgs(argv) {
  const opts = { db: null, apply: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--db') {
      opts.db = argv[i + 1] || null;
      i += 1;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      opts.unknown = a;
    }
  }
  return opts;
}

function fail(code, message) {
  process.stderr.write('FAILED: ' + message + '\n');
  process.exit(code);
}

function loadDriver() {
  try {
    // Node >= 22.5 ships node:sqlite behind an experimental flag that is on
    // by default in 22.x. Requiring it here keeps the fallback honest.
    return require('node:sqlite');
  } catch (err) {
    fail(EXIT_PREFLIGHT, 'node:sqlite is unavailable on this Node build (' + err.code + ')');
    return null;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.db || opts.unknown) {
    process.stderr.write(
      'usage: cleanup-legacy-rows.cjs --db <path> [--apply] [--json]\n' +
        '  default is a read-only report; --apply quarantines and deletes\n'
    );
    process.exit(opts.help ? EXIT_OK : EXIT_USAGE);
  }

  if (!fs.existsSync(opts.db)) fail(EXIT_PREFLIGHT, 'database not found: ' + opts.db);

  const { DatabaseSync } = loadDriver();
  const db = new DatabaseSync(opts.db, { readOnly: !opts.apply });

  const rows = (sql) => db.prepare(sql).all();
  const one = (sql) => rows(sql)[0];

  const check = one('PRAGMA quick_check');
  const checkValue = check ? Object.values(check)[0] : null;
  if (checkValue !== 'ok') fail(EXIT_PREFLIGHT, 'PRAGMA quick_check returned ' + checkValue);

  const tables = rows(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('devices','messages')"
  ).map((r) => r.name);
  if (!tables.includes('devices')) fail(EXIT_PREFLIGHT, 'devices table is missing');

  const ddl = `CREATE TABLE IF NOT EXISTS devices_legacy_quarantine (
    id TEXT PRIMARY KEY,
    raw_json TEXT NOT NULL,
    json_type TEXT NOT NULL,
    quarantined_at TEXT NOT NULL
  )`;

  const byType = rows(
    "SELECT json_type(raw_json) AS t, count(*) AS n FROM devices WHERE json_type(raw_json) != 'object' GROUP BY t ORDER BY n DESC"
  );
  const totalDevices = one('SELECT count(*) AS n FROM devices').n;
  const malformed = byType.reduce((acc, r) => acc + r.n, 0);

  let messages = null;
  if (tables.includes('messages')) {
    const m = one(
      `SELECT count(*) AS total,
              sum(CASE WHEN json_extract(raw_json,'$.readBy') = '[]' THEN 1 ELSE 0 END) AS empty_rb,
              sum(CASE WHEN json_extract(raw_json,'$.readBy') = '["*"]' THEN 1 ELSE 0 END) AS star_rb,
              sum(CASE WHEN json_extract(raw_json,'$.readBy') != '["*"]'
                        AND json_array_length(raw_json,'$.readBy') > 0 THEN 1 ELSE 0 END) AS device_rb
       FROM messages`
    );
    messages = {
      total: m.total,
      readByEmpty: m.empty_rb || 0,
      readByStar: m.star_rb || 0,
      readByDeviceId: m.device_rb || 0,
    };
  }

  const report = {
    database: opts.db,
    mode: opts.apply ? 'apply' : 'dry-run',
    devices: { total: totalDevices, malformed: malformed, byJsonType: byType },
    quarantine: { table: 'devices_legacy_quarantine', moved: 0, deleted: 0, alreadyQuarantined: 0 },
    messages,
    messagesWritten: 0,
  };

  if (!opts.apply) {
    const pending = one(
      'SELECT count(*) AS n FROM devices WHERE json_type(raw_json) != ' + "'object'"
    ).n;
    report.quarantine.pending = pending;
    print(report, opts.json);
    process.exit(EXIT_OK);
  }

  // Apply. One transaction: quarantine, then delete, then verify.
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(ddl);

    const beforeQuarantine = one('SELECT count(*) AS n FROM devices_legacy_quarantine').n;
    db.exec(`INSERT OR IGNORE INTO devices_legacy_quarantine (id, raw_json, json_type, quarantined_at)
             SELECT id, raw_json, json_type(raw_json), datetime('now')
             FROM devices WHERE json_type(raw_json) != 'object'`);
    const afterQuarantine = one('SELECT count(*) AS n FROM devices_legacy_quarantine').n;

    const beforeDevices = one('SELECT count(*) AS n FROM devices').n;
    db.exec(
      `DELETE FROM devices
       WHERE json_type(raw_json) != 'object'
         AND id IN (SELECT id FROM devices_legacy_quarantine)`
    );
    const afterDevices = one('SELECT count(*) AS n FROM devices').n;

    const remaining = one(
      "SELECT count(*) AS n FROM devices WHERE json_type(raw_json) != 'object'"
    ).n;

    if (remaining !== 0) {
      throw new Error('expected 0 malformed rows after cleanup, found ' + remaining);
    }

    db.exec('COMMIT');

    report.quarantine.moved = afterQuarantine - beforeQuarantine;
    // node:sqlite's exec() returns no change count, so derive the number from
    // the row counts around the statement instead of trusting a return value.
    report.quarantine.deleted = beforeDevices - afterDevices;
    report.quarantine.alreadyQuarantined = beforeQuarantine;
    report.devices.totalAfter = afterDevices;
    report.devices.malformedAfter = remaining;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackErr) {
      // Nothing useful to add; the original error is what matters.
    }
    fail(EXIT_APPLY, 'apply rolled back: ' + err.message);
  }

  print(report, opts.json);
  db.close();
  process.exit(EXIT_OK);
}

function print(report, asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  const lines = [];
  lines.push('database  ' + report.database);
  lines.push('mode      ' + report.mode);
  lines.push('devices   ' + report.devices.total + ' total, ' + report.devices.malformed + ' malformed');
  for (const r of report.devices.byJsonType) {
    lines.push('          json_type=' + r.t + ' -> ' + r.n);
  }
  if (report.mode === 'dry-run') {
    lines.push('pending   ' + report.quarantine.pending + ' row(s) would be quarantined and deleted');
  } else {
    lines.push(
      'quarantine moved=' + report.quarantine.moved +
        ' deleted=' + report.quarantine.deleted +
        ' already=' + report.quarantine.alreadyQuarantined
    );
    lines.push('after     ' + report.devices.totalAfter + ' devices, ' + report.devices.malformedAfter + ' malformed');
  }
  if (report.messages) {
    lines.push(
      'messages  ' + report.messages.total + ' total' +
        ' | readBy [] = ' + report.messages.readByEmpty +
        ' | readBy ["*"] = ' + report.messages.readByStar +
        ' | readBy deviceId = ' + report.messages.readByDeviceId
    );
    lines.push('          readBy is never rewritten: ["*"] -> [] would make offline-replay re-deliver ' +
      report.messages.readByStar + ' old messages');
  }
  process.stdout.write(lines.join('\n') + '\n');
}

main();
