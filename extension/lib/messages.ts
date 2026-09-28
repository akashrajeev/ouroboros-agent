export type ContentRequest =
  | { type: 'ouro:observe' }
  | { type: 'ouro:peek' }
  | { type: 'ouro:mask:preview' }
  | { type: 'ouro:mask:clear' }
  | { type: 'ouro:execute'; nodeId: string; op: string; text?: string }
  | { type: 'ouro:scroll'; direction: 'up' | 'down' }
  | { type: 'ouro:settle' };

/** Background -> popup: ask the user before a consequential action (A9). Label is the sanitized label only. */
export interface ConfirmRequest { type: 'ouro:confirm'; label: string }

/** Wraps a confirm round-trip with a timeout; no answer = decline (fail closed). */
export async function confirmWithTimeout(ask: () => Promise<unknown>, ms = 60000): Promise<boolean> {
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), ms));
  const answer = ask().then((v) => v === true).catch(() => false);
  return Promise.race([answer, timeout]);
}
