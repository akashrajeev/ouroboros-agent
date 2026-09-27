#!/usr/bin/env bash
# Copy on-device models + onnxruntime-web WASM into extension/public so the built
# extension can load them from its own origin (no model download from third parties at runtime).
# Run scripts/fetch-models.sh first. extension/public/{models,ort} are gitignored.
set -euo pipefail
# Usage: scripts/stage-models.sh [--ner=download|bundled|off] (default download)  (match WXT_NER_SOURCE at build time)
NER=download
for a in "$@"; do case "$a" in --ner=*) NER="${a#--ner=}";; esac; done
cd "$(dirname "$0")/.."
dst=extension/public
rm -rf "$dst/models"
mkdir -p "$dst/models/paddleocr" "$dst/models/yunet" "$dst/ort"
cp models/paddleocr/{det.onnx,rec.onnx,dict.txt} "$dst/models/paddleocr/"
cp models/yunet/face_detection_yunet_2023mar.onnx "$dst/models/yunet/"
if [ "$NER" = bundled ]; then
mkdir -p "$dst/models/bert-small-pii/onnx"
cp models/bert-small-pii/{config.json,tokenizer.json,tokenizer_config.json,special_tokens_map.json} "$dst/models/bert-small-pii/"
cp models/bert-small-pii/onnx/model_quantized.onnx "$dst/models/bert-small-pii/onnx/"
fi
# GUIClip is optional, and does not alter the PII/privacy gate.
if [ -s models/guiclip/vision-int8.onnx ] && [ -s models/guiclip/embeddings.json ]; then
  mkdir -p "$dst/models/guiclip"
  cp models/guiclip/{vision-int8.onnx,embeddings.json} "$dst/models/guiclip/"
  echo 'GUIClip ViT staged for optional synthetic probe (academic use only)'
else
  echo 'GUIClip not staged; run scripts/prepare-guiclip.sh for the optional ViT probe'
fi
echo "NER: $NER (build with WXT_NER_SOURCE=$NER)"
ort=node_modules/onnxruntime-web/dist
rm -f "$dst"/ort/*
# One runtime for vision + Transformers.js (asyncify build, WebGPU-capable)
cp "$ort"/ort-wasm-simd-threaded.asyncify.{mjs,wasm} "$dst/ort/"
# GUIClip's standard onnxruntime-web WASM entry point uses the jsep artifact.
cp "$ort"/ort-wasm-simd-threaded.jsep.{mjs,wasm} "$dst/ort/"
du -sh "$dst/models" "$dst/ort"
