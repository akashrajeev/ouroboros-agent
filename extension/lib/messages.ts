export type ContentRequest =
  | { type: 'ouro:observe' }
  | { type: 'ouro:execute'; nodeId: string; op: string; text?: string };
