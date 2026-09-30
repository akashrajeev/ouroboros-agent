"""Stage models already extracted from a verified Chrome build, without downloads.

Usage: python demo/stage_windows.py C:\path\to\chrome-mv3
Copies only models/ and ort/ into extension/public for a new local rebuild.
The morning prebuilt archive is a source for assets, not a new planner build.
"""
from pathlib import Path
import hashlib
import shutil
import sys

ROOT=Path(__file__).resolve().parent.parent
REQUIRED=['models/paddleocr/det.onnx','models/paddleocr/rec.onnx','models/paddleocr/dict.txt',
'models/yunet/face_detection_yunet_2023mar.onnx','models/bert-small-pii/config.json',
'models/bert-small-pii/tokenizer.json','models/bert-small-pii/tokenizer_config.json',
'models/bert-small-pii/special_tokens_map.json','models/bert-small-pii/onnx/model_quantized.onnx',
'ort/ort-wasm-simd-threaded.asyncify.mjs','ort/ort-wasm-simd-threaded.asyncify.wasm']

def main():
    if len(sys.argv)!=2:raise SystemExit('Usage: python demo/stage_windows.py PATH_TO_EXTRACTED_CHROME_BUILD')
    source=Path(sys.argv[1]).resolve()
    missing=[name for name in REQUIRED if not (source/name).is_file()]
    if missing:raise SystemExit('Source is not the bundled-NER build; missing: '+', '.join(missing))
    digest=hashlib.sha256((source/'models/bert-small-pii/onnx/model_quantized.onnx').read_bytes()).hexdigest()
    if digest!='b227845ff4989c9f7383874b841895dfbdb9a4d7a20ceb39c3f187271894bf2a':
        raise SystemExit('NER model hash mismatch. Nothing copied.')
    target=ROOT/'extension/public'
    for folder in ('models','ort'):
        shutil.copytree(source/folder,target/folder,dirs_exist_ok=True)
    print('Bundled model/runtime assets staged. Build with WXT_NER_SOURCE=bundled.')

if __name__=='__main__':main()
