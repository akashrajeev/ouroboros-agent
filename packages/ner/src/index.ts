import type { TextDetector, TextMatch } from '@ouroboros/core';
import { DEFAULT_NER_TYPES, toMatches, type TokenEntity } from './align';
import type { PiiType } from '@ouroboros/core';

export { DEFAULT_NER_TYPES, LABEL_MAP, toMatches, tokenSpans } from './align';

export interface NerOptions {
  /** Directory containing <modelId>/config.json and <modelId>/onnx/model_quantized.onnx. */
  localModelPath: string;
  modelId?: string;
  threshold?: number;
  /** Strings shorter than this are skipped (labels like "PAN" never need the model). */
  minChars?: number;
  /** Types the model may contribute (default NAME, ADDRESS). Pass 'all' for every mapped label. */
  types?: ReadonlySet<PiiType> | 'all';
}

/**
 * A3c text PII model (gravitee-io/bert-small-pii-detection, int8 ONNX) via Transformers.js.
 * sanitize() is synchronous, so callers prime() the strings first (batched, cached by string),
 * then pass lookup as a TextDetector. G4: results are cached per exact string.
 */
export class NerDetector {
  private cache = new Map<string, TextMatch[]>();
  stats = { calls: 0, cacheHits: 0, ms: 0 };

  private constructor(
    private pipe: (s: string) => Promise<unknown>,
    private tokenize: (s: string) => string[],
    private threshold: number,
    private minChars: number,
    private allow: ReadonlySet<PiiType> | undefined,
  ) {}

  static async create(opts: NerOptions): Promise<NerDetector> {
    const tf = await import('@huggingface/transformers');
    tf.env.localModelPath = opts.localModelPath.endsWith('/') ? opts.localModelPath : `${opts.localModelPath}/`;
    tf.env.allowRemoteModels = false;
    const pipe = await tf.pipeline('token-classification', opts.modelId ?? 'bert-small-pii', { dtype: 'q8' });
    const tok = pipe.tokenizer as unknown as { tokenize: (s: string) => string[] };
    return new NerDetector((s) => pipe(s) as Promise<unknown>, (s) => tok.tokenize(s), opts.threshold ?? 0.5, opts.minChars ?? 4, opts.types === 'all' ? undefined : (opts.types ?? DEFAULT_NER_TYPES));
  }

  async detect(text: string): Promise<TextMatch[]> {
    const hit = this.cache.get(text);
    if (hit) { this.stats.cacheHits++; return hit; }
    let out: TextMatch[] = [];
    if (text.trim().length >= this.minChars) {
      const t0 = performance.now();
      const ents = (await this.pipe(text)) as TokenEntity[];
      this.stats.ms += performance.now() - t0;
      this.stats.calls++;
      out = toMatches(text, this.tokenize(text), ents, this.threshold, this.allow);
    }
    this.cache.set(text, out);
    return out;
  }

  async prime(texts: Iterable<string>): Promise<void> {
    for (const t of new Set(texts)) await this.detect(t);
  }

  /** Synchronous detector for sanitize(); unprimed strings return no matches. */
  readonly lookup: TextDetector = (text) => this.cache.get(text) ?? [];
}
