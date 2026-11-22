// Replaces the Expo native modules that the app's key manager imports, so the
// same app code can run under Node for the headless flow test.
//
//   node --import ./test/loader.mjs test/app-flow.mjs
//
// The stub file is resolved relative to this file, not to the working
// directory, so the test can be started from anywhere.

import { register } from 'node:module';

register(new URL('./stubs.mjs', import.meta.url));
