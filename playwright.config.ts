// E2E config. NOT RUN in the authoring environment: there was no Next.js build and no network to install it.
// Needs: a Supabase project (staging) with migrations applied, env vars from .env.example, `npm run build && npm start`.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'tv-1080p', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'phone-emulated', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
