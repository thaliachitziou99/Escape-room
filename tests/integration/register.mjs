// Loader registration for the API integration tests: run with
//   node --import ./tests/integration/register.mjs --test tests/integration/api.test.ts
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
