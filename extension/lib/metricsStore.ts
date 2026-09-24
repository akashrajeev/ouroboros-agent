import { toCsv, type StepRecord } from '@ouroboros/core';

/** A12 store: IndexedDB in the background context; rows hold metrics only (no values, labels or URLs beyond origin). */
const DB = 'ouroboros-metrics', STORE = 'steps';

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: ['run_id', 'step'] });
      s.createIndex('run', 'run_id');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export class MetricsStore {
  private db?: Promise<IDBDatabase>;
  constructor(private idb: IDBFactory = indexedDB) {}
  private get conn() { return (this.db ??= open(this.idb)); }

  async add(r: StepRecord): Promise<void> {
    const tx = (await this.conn).transaction(STORE, 'readwrite');
    await done(tx.objectStore(STORE).put(r));
  }

  async rows(runId?: string): Promise<StepRecord[]> {
    const s = (await this.conn).transaction(STORE, 'readonly').objectStore(STORE);
    const all = await done(runId ? s.index('run').getAll(runId) : s.getAll()) as StepRecord[];
    return all.sort((a, b) => a.ts - b.ts || a.step - b.step);
  }

  async runs(): Promise<string[]> {
    return [...new Set((await this.rows()).map((r) => r.run_id))];
  }

  async csv(runId?: string): Promise<string> { return toCsv(await this.rows(runId)); }

  async clear(): Promise<void> {
    await done((await this.conn).transaction(STORE, 'readwrite').objectStore(STORE).clear());
  }
}
