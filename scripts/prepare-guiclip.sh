#!/usr/bin/env bash
# Academic-use GUIClip ViT-B/32; reproducible CPU conversion and fixed-prompt embeddings.
# No user screenshots or user text are downloaded or uploaded by this setup script.
set -euo pipefail
cd "$(dirname "$0")/.."
source=models/guiclip
mkdir -p "$source" models/guiclip-build
rev=6a137b3c96ade017c0dd066deb1949fea86d9efb
base="https://huggingface.co/Jl-wei/guiclip-vit-base-patch32/resolve/$rev"
for f in config.json preprocessor_config.json tokenizer.json tokenizer_config.json special_tokens_map.json merges.txt vocab.json pytorch_model.bin; do
  if [ ! -s "$source/$f" ]; then curl -fsSL --retry 3 -o "$source/$f.tmp" "$base/$f"; mv "$source/$f.tmp" "$source/$f"; fi
done
echo '365271bffbc15144387c5965750cf30ecd5323751b0f0c83531bdc3d60f3ca70  models/guiclip/pytorch_model.bin' | sha256sum -c -
python3 -m venv models/guiclip-build/venv
pip=models/guiclip-build/venv/bin/pip
"$pip" install 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cpu
"$pip" install 'transformers==4.49.0' 'onnx==1.17.0' 'onnxruntime==1.22.1' 'pillow==11.3.0'
OMP_NUM_THREADS=1 models/guiclip-build/venv/bin/python scripts/prepare-guiclip.py
sha256sum models/guiclip/vision-int8.onnx models/guiclip/embeddings.json
