// Test fixture only: Next must never discover application .env files.
const id = require.resolve('@next/env');
const original = require(id);
require.cache[id].exports = {
 ...original,
 loadEnvConfig() { return {combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: []}; },
 processEnv() { return [process.env, {}]; },
 resetEnv() {},
 updateInitialEnv() {},
};
