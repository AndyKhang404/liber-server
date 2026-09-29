import { startTestEnvironment, stopTestEnvironment } from './helpers/testcontainers-environment.js';

export async function setup() {
  await startTestEnvironment();
}

export async function teardown() {
  await stopTestEnvironment();
}
