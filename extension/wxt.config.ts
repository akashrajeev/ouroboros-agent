import { defineConfig } from 'wxt';

// Only the background worker talks to the planner server (A8).
export default defineConfig({
  manifest: {
    name: 'Ouroboros Agent',
    description: 'Privacy-preserving browser agent: raw personal data never leaves the device.',
    permissions: ['activeTab', 'storage', 'scripting', 'tabs'],
    host_permissions: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'],
    browser_specific_settings: { gecko: { id: 'ouroboros-agent@akashrajeev' } },
  },
});
