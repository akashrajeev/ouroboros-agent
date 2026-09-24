import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NerDetector } from '../src/index';

// Runs only when the model has been fetched (scripts/fetch-models.sh). CI skips it.
const MODELS = new URL('../../../models/', import.meta.url).pathname;
const has = existsSync(`${MODELS}bert-small-pii/onnx/model_quantized.onnx`);

describe.skipIf(!has)('gravitee bert-small-pii (local ONNX)', () => {
  it('finds Indian names and addresses and caches results', async () => {
    const ner = await NerDetector.create({ localModelPath: MODELS });
    const s = 'Hi team, this is Rageshwari Embranthiri. I live at 23, Singh Brooks, Rupnagar.';
    const m = await ner.detect(s);
    expect(m.find((x) => x.type === 'NAME')?.value).toBe('Rageshwari Embranthiri');
    expect(m.some((x) => x.type === 'ADDRESS')).toBe(true);
    await ner.detect(s);
    expect(ner.stats.cacheHits).toBe(1);
  }, 60000);
});
