#!/usr/bin/env node

try {
  // Run in the current Node process so stdin closure and signals reach the server.
  await import(new URL('../dist/index.cjs', import.meta.url).href);
} catch (error) {
  console.error('Unable to start Dynamics 365 MCP Server. Run npm run build first.',
    error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
