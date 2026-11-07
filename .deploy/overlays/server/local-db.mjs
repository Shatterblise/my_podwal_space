import fs from 'node:fs/promises';
import path from 'node:path';

const emptyState = () => ({ world_state: null, login_attempts: [] });

/** Small D1-compatible file store for the SQL used by MY WORLD's Worker.
 * It intentionally implements only the statements the application issues.
 * The state file is atomically replaced after each write. */
export class LocalD1Database {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.state = emptyState();
    this.ready = this.#load();
    this.writeQueue = Promise.resolve();
  }

  async #load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.state = {
        world_state: data.world_state && typeof data.world_state === 'object' ? data.world_state : null,
        login_attempts: Array.isArray(data.login_attempts) ? data.login_attempts : []
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.#persist();
    }
  }

  async #persist() {
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.state), { mode: 0o600 });
    await fs.rename(temp, this.filePath);
  }

  async #write(operation) {
    await this.ready;
    const next = this.writeQueue.then(async () => {
      const result = await operation();
      await this.#persist();
      return result;
    });
    this.writeQueue = next.catch(() => {});
    return next;
  }

  prepare(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    const statement = {
      bind: (...params) => makeBound(params),
      first: async () => makeBound([]).first(),
      run: async () => makeBound([]).run()
    };
    const makeBound = params => ({
        first: async () => {
          await this.ready;
          await this.writeQueue;
          if (normalized.startsWith('select state_json, revision from world_state')) {
            const row = this.state.world_state;
            return row ? { state_json: row.state_json, revision: row.revision } : null;
          }
          if (normalized.startsWith('select state_json from world_state')) {
            const row = this.state.world_state;
            return row ? { state_json: row.state_json } : null;
          }
          if (normalized.startsWith('select last_scheduled_at from world_state')) {
            return this.state.world_state ? { last_scheduled_at: this.state.world_state.last_scheduled_at || 0 } : null;
          }
          if (normalized.startsWith('select count(*) as n from login_attempts')) {
            const [ipHash, since] = params;
            return { n: this.state.login_attempts.filter(x => x.ip_hash === ipHash && x.attempted_at > since).length };
          }
          throw new Error(`Local D1: unsupported SELECT: ${sql}`);
        },
        run: async () => this.#write(async () => {
          if (normalized.startsWith('insert or ignore into world_state')) {
            if (!this.state.world_state) {
              const [stateJson, updatedAt] = params;
              this.state.world_state = { id: 1, state_json: stateJson, revision: 1, updated_at: updatedAt, last_scheduled_at: 0, locked_until: 0 };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (normalized.startsWith('update world_state set locked_until = ? where id = 1 and locked_until < ?')) {
            const [newLock, now] = params;
            if (!this.state.world_state || Number(this.state.world_state.locked_until || 0) >= now) return { meta: { changes: 0 } };
            this.state.world_state.locked_until = newLock;
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('update world_state set locked_until = 0 where id = 1')) {
            if (!this.state.world_state) return { meta: { changes: 0 } };
            this.state.world_state.locked_until = 0;
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('update world_state set state_json = ?, revision = revision + 1')) {
            if (!this.state.world_state) throw new Error('Local D1: world_state does not exist.');
            const [stateJson, updatedAt, scheduledAtForCase, scheduledAt] = params;
            const row = this.state.world_state;
            row.state_json = stateJson;
            row.revision = Number(row.revision || 0) + 1;
            row.updated_at = updatedAt;
            if (Number(scheduledAtForCase) > 0) row.last_scheduled_at = scheduledAt;
            row.locked_until = 0;
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('update world_state set state_json = ?, revision = revision + 1')) {
            if (!this.state.world_state) throw new Error('Local D1: world_state does not exist.');
            const [stateJson, updatedAt] = params;
            this.state.world_state.state_json = stateJson;
            this.state.world_state.revision = Number(this.state.world_state.revision || 0) + 1;
            this.state.world_state.updated_at = updatedAt;
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('delete from login_attempts where attempted_at < ?')) {
            const [cutoff] = params;
            const before = this.state.login_attempts.length;
            this.state.login_attempts = this.state.login_attempts.filter(x => x.attempted_at >= cutoff);
            return { meta: { changes: before - this.state.login_attempts.length } };
          }
          if (normalized.startsWith('insert into login_attempts')) {
            const [ipHash, attemptedAt] = params;
            this.state.login_attempts.push({ ip_hash: ipHash, attempted_at: attemptedAt });
            if (this.state.login_attempts.length > 5000) this.state.login_attempts.splice(0, this.state.login_attempts.length - 2500);
            return { meta: { changes: 1 } };
          }
          throw new Error(`Local D1: unsupported write: ${sql}`);
        })
      });
    return statement;
  }
}