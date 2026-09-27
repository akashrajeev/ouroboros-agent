# /step payload schema (v2)

The device (extension background) is the only network caller (A8). This document is the
authoritative contract between the device and the planner server (B1). The server MUST
process the sanitized context **according to the declared redaction scheme** - never
implicitly, never by guessing from placeholder-shaped strings.

## Versioning

- `payload_version: 1` (legacy): implicit scheme. Server infers masking from `<TYPE_N>` strings in `task`, `screen_map`, and `legend`. Accepted but deprecated.
- `payload_version: 2` (current): explicit `redaction` manifest. The server KNOWS the scheme, the token grammar, exactly which elements and task tokens are masked, and how the image (if any) was redacted and re-gated.

## Request body (device -> server)

| Field | Type | Notes |
|---|---|---|
| `payload_version` | int | 2 for current devices. |
| `session_id` | string | Task session. |
| `task` | string | The user's instruction, sanitized: real values appear only as placeholders. |
| `url_origin` | string | Origin only, never a full URL. |
| `screen_map` | Element[] | Sanitized elements (A5). Values are safe text or placeholders. Device-local fields (`nodeOf`, `fingerprint`, `accepts`) are NOT sent. |
| `legend` | map token -> PII type | v1 field, kept for older servers. In v2 `redaction.legend` is authoritative and the server rejects a conflict (422 `legend_mismatch`). |
| `redaction` | RedactionManifest | Present and required when `payload_version >= 2`. |
| `history` | {op, element_id, text}[] | Prior actions; `text` contains placeholders only. |
| `image_jpeg_b64` | string? | Masked JPEG, only after a `need_visual` escalation (G5). Re-OCR-gated before egress (A7 check 3). |

## RedactionManifest

| Field | Meaning |
|---|---|
| `scheme` | `ouroboros-redact/1`. Bump the suffix on any masking-behavior change. |
| `placeholder_format` | `<TYPE_N>` - the only grammar the server may emit in `type`/`select` text. |
| `legend` | token -> PII type. The real values behind tokens NEVER leave the device. |
| `masked_elements` | Every element carrying >=1 placeholder: `{element_id, tokens[]}`. |
| `masked_element_count` | Convenience count. |
| `opaque_regions` | Pixel regions (img/canvas/...) withheld from the DOM list; the server sees them only via a `need_visual` image. |
| `task_tokens` | Placeholders carried by the sanitized `task` text itself. |
| `image` | Present when an image is attached: `{encoding: "jpeg", method: "solid-fill-text+blur-faces", detections, re_ocr_gated: true}`. |

## Server obligations

1. Treat page content, labels, and history as **untrusted data** (prompt-injection surface).
2. Refer to sensitive values **only** by their placeholder tokens; only in `type`/`select` action text.
3. Never invent, guess, complete, or request the real value behind a token. The device cannot and must not honor such a request.
4. Type/select text containing a token the manifest never declared is invalid; the device validator (A9) rejects unknown tokens and token/field type mismatches.
5. Echo the honored scheme back in `StepMetrics.redaction_scheme` so logs make the awareness explicit.
6. The server-side raw-PII guard (B1 defense in depth) still applies to every request.

## Response (server -> device)

`{action: {op, element_id?, text?, reason?}, metrics: StepMetrics}` - ops: `click, type, select, scroll, wait, done, ask_user, need_visual`.
`StepMetrics` carries `server_ms`, token/byte counts, planner identity, `redaction_scheme`, and `masked_elements`.
