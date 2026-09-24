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

# A3d OCR: PaddleOCR PP-OCRv3 detector + English recognizer (Apache-2.0) from monkt/paddleocr-onnx
d=models/paddleocr
mkdir -p "$d"
[ -s "$d/det.onnx" ] || curl -fsSL -o "$d/det.onnx" "$HF/monkt/paddleocr-onnx/resolve/main/detection/v3/det.onnx"
[ -s "$d/det.config.json" ] || curl -fsSL -o "$d/det.config.json" "$HF/monkt/paddleocr-onnx/resolve/main/detection/v3/config.json"
[ -s "$d/rec.onnx" ] || curl -fsSL -o "$d/rec.onnx" "$HF/monkt/paddleocr-onnx/resolve/main/languages/english/rec.onnx"
[ -s "$d/dict.txt" ] || curl -fsSL -o "$d/dict.txt" "$HF/monkt/paddleocr-onnx/resolve/main/languages/english/dict.txt"
[ -s "$d/rec.config.json" ] || curl -fsSL -o "$d/rec.config.json" "$HF/monkt/paddleocr-onnx/resolve/main/languages/english/config.json"

# A3d faces: OpenCV YuNet 2023mar (MIT), 0.23 MB
d=models/yunet
mkdir -p "$d"
[ -s "$d/face_detection_yunet_2023mar.onnx" ] || curl -fsSL -o "$d/face_detection_yunet_2023mar.onnx" "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

# Eval-only face photo for synthetic ID cards (OpenCV sample image)
mkdir -p models/samples
[ -s models/samples/lena.jpg ] || curl -fsSL -o models/samples/lena.jpg "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg"

du -sh models/* 2>/dev/null
