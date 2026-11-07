import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '../server/local-db.mjs';

test('local D1 adapter persists world state, revisions, schedule locks and login limits', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-world-local-'));
  const file = path.join(dir, 'db.json');
  try {
    const db = new LocalD1Database(file);
    const initial = await db.prepare('SELECT state_json FROM world_state WHERE id = 1').first();
    assert.equal(initial, null);
    await db.prepare('INSERT OR IGNORE INTO world_state (id, state_json, revision, updated_at, last_scheduled_at, locked_until) VALUES (1, ?, 1, ?, 0, 0)')
      .bind('{"world":1}', '2026-11-07T00:00:00.000Z').run();
    const loaded = await db.prepare('SELECT state_json, revision FROM world_state WHERE id = 1').first();
    assert.equal(loaded.state_json, '{"world":1}');
    assert.equal(loaded.revision, 1);
    const lock = await db.prepare('UPDATE world_state SET locked_until = ? WHERE id = 1 AND locked_until < ?').bind(200, 100).run();
    assert.equal(lock.meta.changes, 1);
    const secondLock = await db.prepare('UPDATE world_state SET locked_until = ? WHERE id = 1 AND locked_until < ?').bind(300, 100).run();
    assert.equal(secondLock.meta.changes, 0);
    await db.prepare('UPDATE world_state SET locked_until = 0 WHERE id = 1').run();
    await db.prepare('UPDATE world_state SET state_json = ?, revision = revision + 1, updated_at = ?, last_scheduled_at = CASE WHEN ? > 0 THEN ? ELSE last_scheduled_at END, locked_until = 0 WHERE id = 1')
      .bind('{"world":2}', '2026-11-07T01:00:00.000Z', 600, 600).run();
    const db2 = new LocalD1Database(file);
    const restored = await db2.prepare('SELECT state_json, revision FROM world_state WHERE id = 1').first();
    assert.equal(restored.state_json, '{"world":2}');
    assert.equal(restored.revision, 2);
    const scheduled = await db2.prepare('SELECT last_scheduled_at FROM world_state WHERE id = 1').first();
    assert.equal(scheduled.last_scheduled_at, 600);
    await db2.prepare('INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)').bind('ip-a', 1000).run();
    await db2.prepare('INSERT INTO login_attempts (ip_hash, attempted_at) VALUES (?, ?)').bind('ip-a', 1200).run();
    const count = await db2.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND attempted_at > ?').bind('ip-a', 900).first();
    assert.equal(count.n, 2);
    await db2.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(1100).run();
    const afterDelete = await db2.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND attempted_at > ?').bind('ip-a', 900).first();
    assert.equal(afterDelete.n, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});