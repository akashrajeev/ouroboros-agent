#!/usr/bin/env bash
# Fetch client models into ./models (gitignored). All free, open-license downloads.
set -euo pipefail
cd "$(dirname "$0")/.."
HF=https://huggingface.co

# A3c: gravitee-io/bert-small-pii-detection (Apache-2.0), int8 ONNX ~27 MB
d=models/bert-small-pii
mkdir -p "$d/onnx"
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json vocab.txt; do
  [ -s "$d/$f" ] || curl -fsSL -o "$d/$f" "$HF/gravitee-io/bert-small-pii-detection/resolve/main/$f"
done
[ -s "$d/onnx/model_quantized.onnx" ] || curl -fsSL -o "$d/onnx/model_quantized.onnx" "$HF/gravitee-io/bert-small-pii-detection/resolve/main/model.quant.onnx"

du -sh models/* 2>/dev/null
