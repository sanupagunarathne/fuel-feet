import { defineConfig } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:4175';
const apiOrigin = 'http://127.0.0.1:4176';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: webOrigin,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: [
    {
      command: 'npm run dev -w @fuel-feet/api',
      url: `${apiOrigin}/api/health`,
      env: { PORT: '4176', WEB_ORIGIN: webOrigin },
    },
    {
      command: 'npm run dev -w @fuel-feet/web -- --port 4175',
      url: webOrigin,
      env: { PORT: '4176', VITE_API_BASE_URL: '/api' },
    },
  ],
});
