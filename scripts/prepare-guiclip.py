"""Export GUIClip vision ViT to MatMul-only int8 ONNX and fixed prompt embeddings.

The full text encoder is needed only here at build/setup time, never for user screens.
Academic-use-only model: https://huggingface.co/Jl-wei/guiclip-vit-base-patch32
"""
from pathlib import Path
import json
import torch
import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType
from transformers import CLIPModel, CLIPProcessor

source = Path('models/guiclip')
build = Path('models/guiclip-build')
model = CLIPModel.from_pretrained(source, local_files_only=True, torch_dtype=torch.float32).eval()
processor = CLIPProcessor.from_pretrained(source, local_files_only=True)

class Vision(torch.nn.Module):
    def __init__(self, inner):
        super().__init__()
        self.inner = inner

    def forward(self, pixel_values):
        return self.inner.get_image_features(pixel_values=pixel_values)

class Text(torch.nn.Module):
    def __init__(self, inner):
        super().__init__()
        self.inner = inner

    def forward(self, input_ids, attention_mask):
        return self.inner.get_text_features(input_ids=input_ids, attention_mask=attention_mask)

# Export branches separately: a full CLIP graph can exceed memory in a 2 GB build container.
torch.onnx.export(Vision(model).eval(), (torch.randn(1, 3, 224, 224),), build/'vision.onnx',
    input_names=['pixel_values'], output_names=['image_features'], opset_version=17,
    dynamic_axes={'pixel_values': {0: 'batch'}, 'image_features': {0: 'batch'}}, dynamo=False)
torch.onnx.export(Text(model).eval(), (torch.ones(1, 77, dtype=torch.long), torch.ones(1, 77, dtype=torch.long)), build/'text.onnx',
    input_names=['input_ids', 'attention_mask'], output_names=['text_features'], opset_version=17,
    dynamic_axes={'input_ids': {0: 'batch'}, 'attention_mask': {0: 'batch'}, 'text_features': {0: 'batch'}}, dynamo=False)
del model
# Quantize MatMul/Gemm only. ConvInteger from generic dynamic quantization is unsupported on CPU/WASM.
quantize_dynamic(build/'vision.onnx', source/'vision-int8.onnx', weight_type=QuantType.QInt8,
    per_channel=False, op_types_to_quantize=['MatMul', 'Gemm'])
quantize_dynamic(build/'text.onnx', build/'text-int8.onnx', weight_type=QuantType.QInt8,
    per_channel=False, op_types_to_quantize=['MatMul', 'Gemm'])

prompts = [
    'a screenshot of a login form with username and password fields',
    'a screenshot of an account registration form',
    'a screenshot of a shopping checkout and payment form',
    'a screenshot of a search results page',
    'a screenshot of an error or blocked page',
]
tokens = processor(text=prompts, return_tensors='np', padding='max_length', max_length=77)
options = ort.SessionOptions()
options.intra_op_num_threads = 2
session = ort.InferenceSession(str(build/'text-int8.onnx'), options, providers=['CPUExecutionProvider'])
vectors = session.run(None, {k: tokens[k].astype('int64') for k in ('input_ids', 'attention_mask')})[0]
vectors /= np.linalg.norm(vectors, axis=-1, keepdims=True)
(source/'embeddings.json').write_text(json.dumps({'prompts': prompts, 'embeddings': vectors.tolist(),
    'source_revision': '6a137b3c96ade017c0dd066deb1949fea86d9efb', 'use': 'academic-only'}))
print('GUIClip local assets ready:', source/'vision-int8.onnx', source/'embeddings.json')
