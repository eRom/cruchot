#!/bin/bash
# Download ONNX embedding model for production bundling.
# The model is cached in node_modules during dev; this script copies it
# into vendor/models/ for electron-builder extraResources.
#
# Usage: ./scripts/prepare-models.sh

set -euo pipefail

MODEL_NAME="Xenova/all-MiniLM-L6-v2"
CACHE_DIR="node_modules/@huggingface/transformers/.cache/${MODEL_NAME}"
OUTPUT_DIR="vendor/models/${MODEL_NAME}"

echo "=== Preparing ONNX models for production ==="

# Step 1: Ensure model is cached (run a quick Node.js script to trigger download)
if [ ! -f "${CACHE_DIR}/onnx/model.onnx" ]; then
  echo "Model not cached. Downloading via transformers.js..."
  node --input-type=module -e "
    import { pipeline } from '@huggingface/transformers';
    const p = await pipeline('feature-extraction', '${MODEL_NAME}', {
      quantized: true,
      dtype: 'fp32',
      device: 'cpu'
    });
    const out = await p('test', { pooling: 'mean', normalize: true });
    console.log('Model downloaded and verified:', out.data.length, 'dims');
  "
fi

# Step 2: Copy to vendor/models/
echo "Copying model to ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}/onnx"
cp "${CACHE_DIR}/config.json" "${OUTPUT_DIR}/"
cp "${CACHE_DIR}/tokenizer.json" "${OUTPUT_DIR}/"
cp "${CACHE_DIR}/tokenizer_config.json" "${OUTPUT_DIR}/"
cp "${CACHE_DIR}/onnx/model.onnx" "${OUTPUT_DIR}/onnx/"

echo "Model files:"
du -sh "${OUTPUT_DIR}"
find "${OUTPUT_DIR}" -type f | sort

echo "=== Done ==="
