#!/usr/bin/env bash
# Phase 9: end-to-end replay with the real VLM planner (served from notebooks/phase9_vlm_t4.ipynb).
# Needs VLM_BASE_URL, VLM_MODEL, VLM_API_KEY in the environment (never commit them).
# Usage: scripts/phase9-run.sh [pages=20]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VLM_BASE_URL:?set VLM_BASE_URL from the notebook}" "${VLM_API_KEY:?set VLM_API_KEY from the notebook}"
N="${1:-20}"
MODEL_TAG=$(echo "${VLM_MODEL:-vlm}" | tr '/:' '--' | tr 'A-Z' 'a-z')
(cd server && PLANNER=vlm uvicorn app.main:app --port 8001 > /tmp/ouro-vlm-server.log 2>&1) &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 30); do curl -sf http://127.0.0.1:8001/health >/dev/null && break; sleep 1; done
curl -s http://127.0.0.1:8001/health; echo
OURO_SERVER=http://127.0.0.1:8001 OURO_TAG="phase9-${MODEL_TAG}" npm run --silent replay --workspace eval -- "$N"
