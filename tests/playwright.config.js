// Smoke test config. Serves the repo root (the Netlify publish dir) statically.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './smoke',
  outputDir: './test-results',
  timeout: 60000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI
  }
});
