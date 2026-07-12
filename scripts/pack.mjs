#!/usr/bin/env node
/**
 * Đóng gói XRPName MCP server thành các artifact cài đặt:
 *   bundle/xrpname-mcp.cjs       — stdio 1-file (Codex / Claude Code / Desktop, local)
 *   bundle/xrpname-mcp-http.cjs  — HTTP server 1-file (deploy remote: node <file> nghe :3000)
 *   xrpname-mcp.mcpb             — gói extension cho Claude Desktop
 *
 * Dùng: npm run pack
 * Yêu cầu: đã `npm install` (esbuild nằm trong devDependencies).
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync, cpSync, writeFileSync, createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const require = createRequire(import.meta.url);
const pkg = require(path.join(root, 'package.json'));

// 1) Bundle 1-file — stdio (local: Codex / Claude Code / Desktop)
mkdirSync(path.join(root, 'bundle'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/stdio.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(root, 'bundle/xrpname-mcp.cjs'),
  logLevel: 'warning',
});
console.log('✓ bundle/xrpname-mcp.cjs (stdio)');

// 1b) Bundle 1-file — HTTP server (remote: `node xrpname-mcp-http.cjs` → listens on PORT)
// Copy this ONE file + a .env to the server; no `npm install` needed there.
await build({
  entryPoints: [path.join(root, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(root, 'bundle/xrpname-mcp-http.cjs'),
  logLevel: 'warning',
});
console.log('✓ bundle/xrpname-mcp-http.cjs (HTTP server)');

// 2) Gói .mcpb (zip: manifest.json + server/)
const staging = path.join(root, '.mcpb-staging');
rmSync(staging, { recursive: true, force: true });
mkdirSync(path.join(staging, 'server'), { recursive: true });
cpSync(path.join(root, 'bundle/xrpname-mcp.cjs'), path.join(staging, 'server/xrpname-mcp.cjs'));

const manifest = {
  manifest_version: '0.3',
  name: 'xrpname-mcp',
  display_name: 'XRPName MCP',
  version: pkg.version,
  description:
    'XRPL domains (.xrp / .xrpl / .xrpfi / .rlusd) — check availability, AI name ideas, ' +
    'profiles, portfolio, pending offers, order status, and register/manage links.',
  author: { name: 'XRPDomains', url: 'https://xrpdomains.xyz' },
  homepage: 'https://xrpdomains.xyz',
  server: {
    type: 'node',
    entry_point: 'server/xrpname-mcp.cjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/xrpname-mcp.cjs'],
    },
  },
  tools: [
    { name: 'check_domains', description: 'Check 1-25 XRPL domains for availability, pricing and owner' },
    { name: 'recommend_domain', description: 'AI-recommended domain name ideas for a keyword/theme' },
    { name: 'get_domain_profile', description: 'Full public profile of a domain (owner, metadata, socials, history)' },
    { name: 'check_tx_status', description: 'Validation status of an XRPL transaction by hash' },
    { name: 'check_order_status', description: 'Backend order status for a domain you tried to register' },
    { name: 'get_pending_offers', description: 'Pending mint/incoming/outgoing operations for a wallet' },
    { name: 'get_portfolio', description: 'All XRPL domains owned by a wallet address' },
    { name: 'register_domain', description: 'Link to register a domain on xrpdomains.xyz' },
    { name: 'set_primary_domain', description: 'Link to set a domain as the wallet primary' },
  ],
  user_config: {},
  keywords: ['xrpl', 'domains', 'xrp', 'nft', 'xrpdomains'],
  license: 'UNLICENSED',
  compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=18.0.0' } },
};
writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));

// zip — dùng PowerShell trên Windows, `zip` trên *nix
const out = path.join(root, 'xrpname-mcp.mcpb');
rmSync(out, { force: true });
try {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${staging}/*' -DestinationPath '${out}.zip' -Force; Move-Item '${out}.zip' '${out}' -Force`,
  ], { stdio: 'inherit' });
} catch {
  execFileSync('zip', ['-qr', out, 'manifest.json', 'server'], { cwd: staging, stdio: 'inherit' });
}
rmSync(staging, { recursive: true, force: true });
console.log('✓ xrpname-mcp.mcpb (v' + pkg.version + ')');
