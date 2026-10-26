#!/usr/bin/env node
// Standalone refresh for cron: node dist/refresh.js
process.env.IG_REFRESH_ONLY = "1";
await import("./index.js");
