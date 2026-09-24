import {
  leakGate, legend, PlaceholderMap, rehydrate, sanitize, validateAction, wireScreenMap,
  type Action, type RawObservation, type ScreenMap,
} from '@ouroboros/core';

/**
 * The device-side loop: A2 -> sanitize (A3-A6) -> A7 -> A8 -> A9 -> A10 -> A11.
 * All I/O is injected so the loop is testable without a browser.
 */
export interface LoopDeps {
  observe(): Promise<RawObservation>;
  execute(nodeId: string, op: string, text?: string): Promise<{ ok: boolean; reason?: string }>;
  /** A8: the ONLY network call. Receives the already-gated payload string. */
  post(body: string): Promise<{ action: unknown; metrics?: Record<string, unknown> }>;
  confirm(label: string): Promise<boolean>;
  log?(e: LoopEvent): void;
  canaries?: string[];
}

export type LoopEvent =
  | { kind: 'sent'; step: number; sha256: string; bytes: number; ms: Record<string, number> }
  | { kind: 'blocked'; step: number; hits: { kind: string; type?: string }[] }
  | { kind: 'rejected'; step: number; reason: string }
  | { kind: 'executed'; step: number; op: string; element_id?: string | null }
  | { kind: 'finished'; step: number; reason: string };

export interface RunResult { status: 'done' | 'blocked' | 'rejected' | 'declined' | 'max_steps' | 'exec_failed'; steps: number; reason?: string }

/** Tokenize the user's task with the same map so the planner sees placeholders. */
export function sanitizeTask(task: string, map: PlaceholderMap): string {
  const obs: RawObservation = { url: '', viewport: { w: 1, h: 1 }, elements: [{ nodeId: 't', tag: 'p', role: 'text', name: task, text: '', value: '', bbox: { x: 0, y: 0, w: 1, h: 1 } }], opaque: [] };
  return sanitize(obs, map).screen.elements[0]!.label;
}

export async function runTask(task: string, deps: LoopDeps, opts: { maxSteps?: number; sessionId?: string; map?: PlaceholderMap } = {}): Promise<RunResult> {
  const map = opts.map ?? new PlaceholderMap();
  const history: Action[] = [];
  const safeTask = sanitizeTask(task, map);
  const now = () => performance.now();
  try {
    for (let step = 1; step <= (opts.maxSteps ?? 20); step++) {
      const t0 = now();
      const raw = await deps.observe();
      const t1 = now();
      const { screen } = sanitize(raw, map);
      const t2 = now();
      const body = JSON.stringify({
        session_id: opts.sessionId ?? 'local',
        task: safeTask,
        ...wireScreenMap(screen),
        screen_map: screen.elements,
        legend: legend(map),
        history: history.map((h) => ({ op: h.op, element_id: h.element_id ?? null, text: h.text ?? null })),
      });
      const gate = await leakGate(body, map, { canaries: deps.canaries });
      const t3 = now();
      if (!gate.pass) {
        deps.log?.({ kind: 'blocked', step, hits: gate.hits.map((h) => ({ kind: h.kind, type: h.type })) });
        return { status: 'blocked', steps: step };
      }
      const res = await deps.post(body);
      const t4 = now();
      deps.log?.({ kind: 'sent', step, sha256: gate.sha256, bytes: gate.bytes, ms: { observe: t1 - t0, sanitize: t2 - t1, gate: t3 - t2, server: t4 - t3 } });

      const planned: ScreenMap = screen;
      const needsFresh = ['click', 'type', 'select'].includes((res.action as Action)?.op);
      const current = needsFresh ? sanitize(await deps.observe(), map).screen : planned;
      const v = validateAction(res.action, planned, current, map);
      if (!v.ok) {
        deps.log?.({ kind: 'rejected', step, reason: v.reason });
        return { status: 'rejected', steps: step, reason: v.reason };
      }
      const a = v.action;
      if (a.op === 'done') { deps.log?.({ kind: 'finished', step, reason: a.reason ?? '' }); return { status: 'done', steps: step }; }
      if (a.op === 'ask_user' || a.op === 'need_visual' || a.op === 'wait' || a.op === 'scroll') {
        // Stub-era: visual escalation and scrolling land in later phases.
        history.push(a);
        continue;
      }
      if (v.needsConfirm) {
        const el = current.elements.find((e) => e.id === a.element_id);
        if (!(await deps.confirm(el?.label ?? a.element_id ?? ''))) return { status: 'declined', steps: step };
      }
      const nodeId = current.nodeOf[a.element_id!]!;
      const text = a.text ? rehydrate(a.text, map).text : undefined; // A10, in memory only
      const r = await deps.execute(nodeId, a.op, text);
      if (!r.ok) return { status: 'exec_failed', steps: step, reason: r.reason };
      deps.log?.({ kind: 'executed', step, op: a.op, element_id: a.element_id });
      history.push(a);
    }
    return { status: 'max_steps', steps: opts.maxSteps ?? 20 };
  } finally {
    if (!opts.map) map.clear(); // per-task clear of A6m
  }
}
