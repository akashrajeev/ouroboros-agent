/** Phase 12: image-dependent document-type selection proxy and masking, no VLM planner.
 * 25 fresh seeded cards x four capture conditions. Ground truth is the card header.
 * Run chunks with START and COUNT environment variables; JSONL is append-only and resumable.
 * Selection is by OCR of the masked image, not by seeing the hidden ground truth.
 */
import { fakerEN_IN as f } from '@faker-js/faker';
import { normalizeValue, leakGate, PlaceholderMap } from '@ouroboros/core';
import { NerDetector } from '@ouroboros/ner';
import { PaddleOcr, YuNet, redactImage } from '@ouroboros/vision';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { makeCard, toImg, HEADERS } from './images';

const M = new URL('../../models/', import.meta.url).pathname;
const OUT = new URL('../results/visual-robustness-12091/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const start = Number(process.env.START ?? 0), count = Number(process.env.COUNT ?? 10);
if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || start + count > 100) throw new Error('START/COUNT must select 1-100');
const conditions = ['clean','jpeg','blur','lowres'] as const;
type Condition = typeof conditions[number];
const readable = (txt:string, v:string)=>normalizeValue(txt).includes(normalizeValue(v));
const transform = async (b: Buffer, condition: Condition) => {
  if (condition==='clean') return b;
  if (condition==='jpeg') { const compressed=await sharp(b).jpeg({quality:35,chromaSubsampling:'4:2:0'}).toBuffer(); return sharp(compressed).png().toBuffer(); }
  if (condition==='blur') return sharp(b).blur(1.65).png().toBuffer();
  const small=await sharp(b).resize(360,220,{kernel:'lanczos3'}).png().toBuffer(); return sharp(small).resize(720,440,{kernel:'nearest'}).png().toBuffer();
};
const face = readFileSync(`${M}samples/lena.jpg`);
const ocr = await PaddleOcr.create(ort as any, `${M}paddleocr/det.onnx`, `${M}paddleocr/rec.onnx`, readFileSync(`${M}paddleocr/dict.txt`, 'utf8'));
const yn = await YuNet.create(ort as any, `${M}yunet/face_detection_yunet_2023mar.onnx`);
const ner = existsSync(`${M}bert-small-pii/onnx/model_quantized.onnx`) ? await NerDetector.create({localModelPath:M}) : undefined;
const target = new Set(Array.from({length:count},(_,i)=>start+i));
for (let card = 0; card < 25; card++) {
  f.seed(12091 + card);
  const c = await makeCard(face, false);
  for (let ci=0;ci<4;ci++) {
    const index=card*4+ci;
    if (!target.has(index)) continue;
    const condition=conditions[ci]!;
    const png=await transform(c.png,condition);
    const img=await toImg(png);
    const rawLines=await ocr.read(img);
    const rawText=rawLines.map(x=>x.text).join('\n');
    const t=performance.now();
    const boxes=await redactImage(img,rawLines,await yn.detect(img),{extraDetectors:ner?[(x)=>ner.detect(x)]:[]});
    const re=await ocr.read(img);
    boxes.push(...await redactImage(img,re,[],{extraDetectors:ner?[(x)=>ner.detect(x)]:[]}));
    const visionMs=performance.now()-t;
    const afterBuf=await sharp(Buffer.from(img.data.buffer),{raw:{width:img.width,height:img.height,channels:4}}).png().toBuffer();
    const after=(await ocr.read(await toImg(afterBuf))).map(x=>x.text).join('\n');
    const labels=HEADERS.filter(h=>readable(after,h));
    const predicted=labels.length===1?labels[0]:null;
    const rawReadable=c.values.filter(v=>readable(rawText,v.value)).map(v=>v.type);
    const afterReadable=c.values.filter(v=>readable(after,v.value)).map(v=>v.type);
    const gate=await leakGate('',new PlaceholderMap(),{imageText:after});
    const failure=predicted===c.header?'correct':!predicted?(labels.length>1?'ambiguous_header':'unreadable_header'):'wrong_header';
    const row={index,card,condition,seed:12091+card,header:c.header,predicted,failure,rawReadable,afterReadable,gatePass:gate.pass,boxes:boxes.length,visionMs:+visionMs.toFixed(1),pngBytes:png.length};
    appendFileSync(`${OUT}rows.jsonl`,JSON.stringify(row)+'\n');
    console.log(JSON.stringify(row));
  }
}
