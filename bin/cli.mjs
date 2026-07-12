#!/usr/bin/env node
// npx entry — runs the stdio MCP server (importing dist/stdio.js starts it).
// Requires a build first (npm run build); `prepublishOnly` handles this on publish.
import '../dist/stdio.js';
