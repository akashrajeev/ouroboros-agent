import { defineConfig } from 'wxt';

// Only the background worker talks to the planner server (A8).
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Ouroboros Agent',
    description: 'Privacy-preserving browser agent: raw personal data never leaves the device.',
    permissions: ['activeTab', 'storage', 'scripting', 'tabs', ...(browser === 'firefox' ? [] : ['offscreen'])],
    // onnxruntime-web needs WebAssembly compilation in extension pages.
    content_security_policy: browser === 'firefox'
      ? "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
      : { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    host_permissions: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'],
    browser_specific_settings: { gecko: { id: 'ouroboros-agent@akashrajeev' } },
  }),
});
