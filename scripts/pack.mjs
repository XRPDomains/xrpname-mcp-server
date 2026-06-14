#!/usr/bin/env node
/**
 * Đóng gói XRPName MCP server thành 2 artifact cài đặt:
 *   bundle/xrpname-mcp.cjs   — bundle 1-file (Codex / Claude Code / config thủ công)
 *   xrpname-mcp.mcpb         — gói extension cho Claude Desktop
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

// 1) Bundle 1-file
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
console.log('✓ bundle/xrpname-mcp.cjs');

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
    'XRPL domains (.xrp / .xrpl / .xrpfi / .rlusd) — check availability, pricing, profiles, ' +
    'tx status, portfolio and pending offers.',
  author: { name: 'XRPDomains', url: 'https://xrpdomains.xyz' },
  homepage: 'https://xrpdomains.xyz',
  server: {
    type: 'node',
    entry_point: 'server/xrpname-mcp.cjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/xrpname-mcp.cjs'],
      env: { DEV_ADDRESS: '${user_config.dev_address}' },
    },
  },
  tools: [
    { name: 'check_domains', description: 'Check 1-25 XRPL domains for availability, pricing and owner' },
    { name: 'get_domain_profile', description: 'Full public profile of a domain (owner, metadata, socials)' },
    { name: 'check_tx_status', description: 'Validation status of an XRPL transaction by hash' },
    { name: 'get_pending_offers', description: 'Pending incoming/outgoing NFToken offers for a wallet' },
    { name: 'get_portfolio', description: 'All XRPL domains owned by a wallet address' },
  ],
  user_config: {
    dev_address: {
      type: 'string',
      title: 'XRPL Address (dev)',
      description: 'Optional. Your XRPL r... address — stands in for wallet auth until OAuth ships.',
      required: false,
      default: '',
    },
  },
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
