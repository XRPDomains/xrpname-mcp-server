# XRPName MCP Server — Windows + IIS Deployment Guide

> **Audience:** Developer implementing `xrpname-mcp-server` per `XRPDomains-MCP-Server-Spec.md`.
> **Target environment:** Windows Server with IIS already running the existing xrpdomains.xyz backend.
> **Outcome:** Production MCP server reachable at `https://mcp.xrpdomains.xyz/mcp`.
>
> **This doc supersedes §13 (Deployment) of the main spec for the Windows IIS target.** The Linux/Docker references in the main spec remain valid for development environments (local dev, CI testing) but production deployment follows this guide.

---

## Table of contents

1. Target environment
2. Architecture overview
3. Prerequisites — software to install
4. One-time server bootstrap (45-60 minutes)
5. Code deployment workflow
6. IIS site + reverse proxy configuration
7. TLS certificate (Let's Encrypt via win-acme)
8. Verification + smoke tests
9. Operations runbook
10. Troubleshooting
11. Security checklist
12. Appendix A — `web.config` template
13. Appendix B — `ecosystem.config.js` template (PM2)
14. Appendix C — `.env.example` template
15. Appendix D — `deploy.ps1` PowerShell script
16. Appendix E — `Caddyfile` reference (alternative, NOT used here — for context only)

---

## 1. Target environment

- **OS:** Windows Server 2019/2022 (or Windows 10/11 Pro for dev)
- **Existing infra:** IIS already installed, hosting xrpdomains.xyz web app
- **Disk:** ~2 GB free for Node.js + npm cache + Redis data + logs
- **RAM:** 1 GB minimum dedicated for MCP server process (4+ GB total recommended for the VPS)
- **Network:** Inbound 443 open, outbound to XRPL public servers + xrpdomains.xyz API
- **Access:** Admin-level RDP or PowerShell remoting

You do NOT need to install Docker, WSL2, or Linux. The MCP server is a native Node.js process managed by PM2 and proxied by IIS.

---

## 2. Architecture overview

```
[Claude / Cursor / Codex / Custom GPT]
        │ HTTPS
        ▼
https://mcp.xrpdomains.xyz/mcp
        │
        │ DNS → VPS public IP
        ▼
┌──────────────────────────────────────────────────┐
│  Windows VPS                                     │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ IIS                                      │   │
│  │   • TLS termination (443)                │   │
│  │   • Host header: mcp.xrpdomains.xyz      │   │
│  │   • URL Rewrite (reverse proxy)          │   │
│  │   • ARR Server Proxy enabled             │   │
│  └──────────────────────────────────────────┘   │
│            │ proxy localhost:3000                │
│            ▼                                     │
│  ┌──────────────────────────────────────────┐   │
│  │ PM2 (managed by pm2-windows-service)     │   │
│  │   • Node.js 20 process                   │   │
│  │   • dist/index.js (compiled MCP server)  │   │
│  │   • Auto-restart, log rotation           │   │
│  │   • Listen 127.0.0.1:3000                │   │
│  └──────────────────────────────────────────┘   │
│            │                                     │
│            ▼                                     │
│  ┌──────────────────────────────────────────┐   │
│  │ Memurai (Redis-compatible for Windows)   │   │
│  │   • localhost:6379                       │   │
│  │   • Sessions + cache                     │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

Key boundaries:
- IIS owns TLS + DNS routing. Node.js never speaks HTTPS directly.
- PM2 owns process lifecycle (restart, logs, autostart).
- Node.js binds **only** to `127.0.0.1:3000` — never to public interface — so the MCP server is unreachable except through IIS.
- Memurai binds to `127.0.0.1:6379` for the same reason.

---

## 3. Prerequisites — software to install

Download links + installation order:

| # | Software | Source | Purpose |
|---|---|---|---|
| 1 | **Node.js 20 LTS** | <https://nodejs.org/en/download/> (Windows Installer .msi) | Runtime + npm |
| 2 | **Git for Windows** | <https://git-scm.com/download/win> | Pull repo |
| 3 | **PM2** | `npm install -g pm2` | Process manager |
| 4 | **pm2-windows-service** | `npm install -g pm2-windows-service` | Run PM2 as Windows service |
| 5 | **IIS** | Already installed | Reverse proxy + TLS |
| 6 | **URL Rewrite module** | <https://www.iis.net/downloads/microsoft/url-rewrite> | Needed for ARR |
| 7 | **Application Request Routing (ARR) 3.0** | <https://www.iis.net/downloads/microsoft/application-request-routing> | IIS reverse proxy engine |
| 8 | **Memurai** | <https://www.memurai.com/get-memurai> (Developer Edition is free) | Redis-compatible cache |
| 9 | **win-acme** | <https://www.win-acme.com/> (download .zip) | Let's Encrypt TLS for IIS |
| 10 | **Visual Studio Build Tools** (optional) | <https://visualstudio.microsoft.com/visual-cpp-build-tools/> | Only if any npm package needs node-gyp compile |

All free.

---

## 4. One-time server bootstrap (45-60 minutes)

### Step 4.1 — Install Node.js + verify

Run the `.msi` from nodejs.org. Accept defaults (includes npm, adds to PATH).

```powershell
node --version    # → v20.x.x
npm --version     # → 10.x.x
```

### Step 4.2 — Install Git + verify

```powershell
git --version    # → git version 2.x
```

### Step 4.3 — Install PM2 globally

```powershell
npm install -g pm2 pm2-windows-service
pm2 --version    # → 5.x.x
```

### Step 4.4 — Configure PM2 as a Windows service

This step makes PM2 (and therefore the MCP server) survive reboots.

```powershell
# Open elevated PowerShell (Run as Administrator)
pm2-service-install -n PM2
```

When prompted:
- **Set PM2_HOME?** → Yes
- **PM2_HOME path?** → Press Enter to accept default (`C:\Users\<user>\.pm2`)
- **Set PM2_SERVICE_PM2_DIR?** → Yes
- **PM2_SERVICE_PM2_DIR path?** → Press Enter to accept

Verify the service:
```powershell
Get-Service PM2
# Status: Running, StartType: Automatic
```

### Step 4.5 — Install IIS URL Rewrite + ARR

Download both `.msi` files (see Prerequisites) and install via wizard. Defaults are fine.

After installation, open **IIS Manager**:
1. Click the **server name** (top of left tree)
2. In center pane, double-click **Application Request Routing Cache**
3. Click **Server Proxy Settings** (right panel)
4. Check **Enable proxy**
5. Click **Apply**

Without this step, the reverse proxy rule in `web.config` will not work.

### Step 4.6 — Install Memurai

Run the `.msi`. Default install creates `Memurai` Windows service that auto-starts.

Verify:
```powershell
Get-Service Memurai    # Status: Running
redis-cli ping         # → PONG  (if redis-cli is in PATH; Memurai installs its own client)
# Or:
"C:\Program Files\Memurai\memurai-cli.exe" ping    # → PONG
```

### Step 4.7 — Install win-acme

Extract `win-acme.v2.x.x.x64.pluggable.zip` to `C:\win-acme\`. No installer needed — it's a portable .exe.

You'll run it after IIS site is created (Step 6 + Step 7).

### Step 4.8 — Create the working directory + clone repo

```powershell
# Create dedicated folder for the app
New-Item -ItemType Directory -Path "C:\inetpub\xrpname-mcp" -Force
cd C:\inetpub\xrpname-mcp

# Clone the repo (replace with actual repo URL)
git clone https://github.com/xrpdomains/xrpname-mcp-server.git .

# Install dependencies + build TypeScript → dist/
npm ci
npm run build
```

After this step, `dist/index.js` should exist.

### Step 4.9 — Create `.env` from template

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in the required values. See Appendix C for the full template.

**Critical secrets to generate:**

```powershell
# Generate a 32-byte hex JWT secret (run once, keep forever)
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
# Paste output as OAUTH_JWT_SECRET in .env
```

**Do NOT commit `.env` to Git.** Verify `.gitignore` contains `.env`.

---

## 5. Code deployment workflow

After the one-time bootstrap, deploying a new version is:

```powershell
cd C:\inetpub\xrpname-mcp
git fetch --all --tags
git checkout v1.0.0        # specific tag, never deploy from main
npm ci                     # clean install (handles dep changes)
npm run build              # rebuild dist/
pm2 reload xrpname-mcp     # zero-downtime reload
```

Or use the bundled `deploy.ps1` (Appendix D) for one-command updates.

### First-time start

After Step 4.9 (`.env` filled in):

```powershell
cd C:\inetpub\xrpname-mcp
pm2 start ecosystem.config.js
pm2 save                   # persist PM2 process list across reboots
```

Verify it's running:
```powershell
pm2 list
# ┌─────┬──────────────┬─────────┬──────┬─────────┐
# │ id  │ name         │ status  │ cpu  │ memory  │
# ├─────┼──────────────┼─────────┼──────┼─────────┤
# │ 0   │ xrpname-mcp  │ online  │ 0%   │ 80 MB   │
# └─────┴──────────────┴─────────┴──────┴─────────┘

curl http://localhost:3000/health
# {"status":"ok","uptime":12,"redis":"connected"}
```

If `/health` returns 200, the Node.js process is healthy. Time to wire up IIS.

---

## 6. IIS site + reverse proxy configuration

### Step 6.1 — Create the IIS site

In **IIS Manager**:

1. Right-click **Sites** → **Add Website…**
2. Site name: `mcp.xrpdomains.xyz`
3. Physical path: `C:\inetpub\xrpname-mcp\iis-root` (we'll create this in step 6.2)
4. Binding:
   - Type: **HTTP** (we'll add HTTPS in Step 7 after TLS cert)
   - IP address: All Unassigned
   - Port: **80** (temporary, just to validate)
   - Host name: `mcp.xrpdomains.xyz`
5. Click **OK**

### Step 6.2 — Create iis-root with `web.config`

The iis-root folder exists only to host the `web.config` reverse-proxy rule. No actual files served; everything routes to Node.js.

```powershell
New-Item -ItemType Directory -Path "C:\inetpub\xrpname-mcp\iis-root" -Force
```

Copy the `web.config` template from **Appendix A** into `C:\inetpub\xrpname-mcp\iis-root\web.config`.

### Step 6.3 — Test reverse proxy over HTTP

```powershell
curl http://mcp.xrpdomains.xyz/health
# → {"status":"ok",...}
```

If you see the JSON response, IIS is correctly proxying to Node.js on port 3000.

If you see 404 or 502:
- Check ARR Server Proxy is enabled (Step 4.5)
- Check `web.config` placement (must be in physicalPath root)
- Check PM2 process is running (`pm2 list`)
- Check Node.js really bound to 127.0.0.1:3000 (not 0.0.0.0:3000): `netstat -ano | findstr :3000`

---

## 7. TLS certificate (Let's Encrypt via win-acme)

### Step 7.1 — Run win-acme

```powershell
cd C:\win-acme
.\wacs.exe
```

Interactive menu:
1. Press **N** → "Create certificate (simple for IIS)"
2. Select the **mcp.xrpdomains.xyz** site from the list
3. Press **Enter** to accept the host header default
4. Accept Let's Encrypt ToS (press **y**)
5. Enter your email for renewal notifications
6. win-acme will:
   - Validate domain ownership via HTTP-01 challenge
   - Request cert from Let's Encrypt
   - Install cert in Windows certificate store
   - Bind cert to the IIS site on port 443 (creates HTTPS binding automatically)
   - Set up a scheduled task for auto-renewal every 60 days

### Step 7.2 — Verify HTTPS

```powershell
curl https://mcp.xrpdomains.xyz/health
# → {"status":"ok",...}
```

Browser test: open `https://mcp.xrpdomains.xyz/health` — should show JSON with green lock icon.

### Step 7.3 — Optional: redirect HTTP → HTTPS

Add to `web.config` (place rule BEFORE the reverse proxy rule):

```xml
<rule name="HTTP to HTTPS" stopProcessing="true">
    <match url=".*" />
    <conditions>
        <add input="{HTTPS}" pattern="off" />
    </conditions>
    <action type="Redirect" url="https://{HTTP_HOST}/{R:0}" redirectType="Permanent" />
</rule>
```

Full updated `web.config` shown in Appendix A.

---

## 8. Verification + smoke tests

### Step 8.1 — Health + metrics

```powershell
curl https://mcp.xrpdomains.xyz/health      # 200 OK + JSON
curl https://mcp.xrpdomains.xyz/ready       # 200 OK
curl https://mcp.xrpdomains.xyz/metrics     # Prometheus text
```

### Step 8.2 — OAuth discovery

```powershell
curl https://mcp.xrpdomains.xyz/.well-known/oauth-authorization-server
# JSON document with authorization_endpoint, token_endpoint, etc.
```

### Step 8.3 — MCP `tools/list` (unauthenticated)

Note: unauthenticated should return `401` per OAuth spec; authentication requires the full OAuth roundtrip.

```powershell
curl -X POST https://mcp.xrpdomains.xyz/mcp `
     -H "Content-Type: application/json" `
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Expected: 401 Unauthorized with WWW-Authenticate header
```

### Step 8.4 — End-to-end via Claude Code

On your dev machine (not the server):

```bash
claude mcp add xrpname-mcp --transport http https://mcp.xrpdomains.xyz/mcp
# Restart Claude Code (/quit then relaunch)
```

In Claude Code:
```
> List the tools available from xrpname-mcp
```

Claude will trigger the OAuth flow on first call (browser opens), then return the 6 Phase 1 tools.

### Step 8.5 — Run smoke script

```powershell
cd C:\inetpub\xrpname-mcp
npm run smoke -- --target=https://mcp.xrpdomains.xyz
```

Expected: all 6 tools respond successfully with mocked OAuth token (test mode).

---

## 9. Operations runbook

### View logs

```powershell
pm2 logs xrpname-mcp                    # tail logs realtime
pm2 logs xrpname-mcp --lines 200        # last 200 lines
pm2 logs xrpname-mcp --err              # errors only
```

Log files on disk:
- `%USERPROFILE%\.pm2\logs\xrpname-mcp-out.log` (stdout)
- `%USERPROFILE%\.pm2\logs\xrpname-mcp-error.log` (stderr)

PM2 rotates logs daily (configured in `ecosystem.config.js`).

### Restart / reload

```powershell
pm2 reload xrpname-mcp     # zero-downtime (preferred)
pm2 restart xrpname-mcp    # full restart (drops in-flight requests)
pm2 stop xrpname-mcp       # stop
pm2 start xrpname-mcp      # start again
```

### Update to a new release

```powershell
cd C:\inetpub\xrpname-mcp
git fetch --all --tags
git checkout v1.0.1
npm ci
npm run build
pm2 reload xrpname-mcp
```

Or use `.\scripts\deploy.ps1 -Tag v1.0.1` (Appendix D).

### Rollback

```powershell
cd C:\inetpub\xrpname-mcp
git checkout v1.0.0    # previous tag
npm ci
npm run build
pm2 reload xrpname-mcp
```

### Memurai (Redis) ops

```powershell
Get-Service Memurai
Restart-Service Memurai

# Connect to Memurai CLI
& "C:\Program Files\Memurai\memurai-cli.exe"
> KEYS mcp:*           # see all MCP keys
> FLUSHDB              # nuke cache (forces refetch on next call)
> exit
```

### IIS ops

```powershell
iisreset               # restart IIS (rare; only after web.config edits sometimes need it)

# Or per-site
Stop-WebSite "mcp.xrpdomains.xyz"
Start-WebSite "mcp.xrpdomains.xyz"

# View IIS request log
Get-Content "C:\inetpub\logs\LogFiles\W3SVC<id>\u_ex<date>.log" -Tail 50
```

### TLS cert renewal check

```powershell
# win-acme creates a scheduled task. Check it:
Get-ScheduledTask -TaskName "win-acme renew*"

# Force a renewal check now (testing):
cd C:\win-acme
.\wacs.exe --renew
```

### Server reboot

PM2 auto-starts (because pm2-windows-service is registered). MCP server should be back up within ~30 seconds of boot.

Verify after a planned reboot:
```powershell
pm2 list
curl https://mcp.xrpdomains.xyz/health
```

---

## 10. Troubleshooting

### Symptom — `502 Bad Gateway` from IIS

Cause: IIS can't reach Node.js on port 3000.

Check:
1. `pm2 list` → is xrpname-mcp `online`?
2. `netstat -ano | findstr :3000` → is Node.js listening?
3. `curl http://localhost:3000/health` from the server itself → OK?
4. Is Windows Firewall blocking localhost connections? (rare, but check)
5. ARR Server Proxy is enabled in IIS Manager?

### Symptom — `404 Not Found` on `/mcp`

Cause: `web.config` rewrite rule not matching, or wrong rule order.

Check:
1. `web.config` is in the iis-root folder (not parent / child).
2. The reverse-proxy rule pattern is `(.*)`.
3. No URL Rewrite outbound rule is mangling the response.

### Symptom — TLS errors (cert not trusted, expired)

Cause: win-acme didn't bind the cert correctly, or renewal failed.

Check:
1. IIS Manager → Site bindings → HTTPS binding shows a valid cert?
2. `certlm.msc` → Personal → Certificates → cert for `mcp.xrpdomains.xyz` exists + not expired?
3. Re-run `wacs.exe` and pick "Renew certificate" for the site.

### Symptom — Redis connection errors in logs

Cause: Memurai service stopped or wrong REDIS_URL.

Check:
1. `Get-Service Memurai` → Running?
2. `.env` has `REDIS_URL=redis://localhost:6379` (no auth needed for default Memurai install)?
3. `memurai-cli ping` returns PONG?

### Symptom — OAuth flow times out / redirect loop

Cause: `OAUTH_ISSUER` env var mismatch or scheduled tasks for cert renewal blocking ports.

Check:
1. `.env` has `OAUTH_ISSUER=https://mcp.xrpdomains.xyz` (exact match including https).
2. No other process bound to 443.
3. Network log: does the browser actually reach `/authorize`?

### Symptom — XRPL submit fails repeatedly

Cause: XRPL public WSS endpoint rate limit or transient.

Check:
1. `.env` has both `XRPL_WSS_URL` and `XRPL_BACKUP_WSS_URL` set.
2. Code uses backup on primary failure.
3. Consider running a dedicated XRPL node if traffic justifies.

---

## 11. Security checklist

Before going public:

- [ ] `.env` is in `.gitignore` and never committed
- [ ] `OAUTH_JWT_SECRET` is unique to production (NOT shared with dev/staging)
- [ ] Node.js binds to `127.0.0.1:3000`, not `0.0.0.0:3000`
- [ ] Memurai binds to `127.0.0.1:6379` (not exposed publicly)
- [ ] Windows Firewall blocks port 3000 and 6379 inbound from public
- [ ] IIS only exposes 443 (and 80 for HTTP→HTTPS redirect)
- [ ] HSTS header set in `web.config` (Strict-Transport-Security)
- [ ] Rate limits in `.env` set to production values (see spec §12.1)
- [ ] Logs do NOT contain user wallet private data, refcode, or OAuth tokens (audit pino redaction config)
- [ ] PM2 service runs as non-admin user (configured during `pm2-service-install`)
- [ ] win-acme scheduled task is active
- [ ] Backup plan documented for `.env` (offline copy in password manager)
- [ ] Monitoring + alerting set up (UptimeRobot ping `/health`, or Datadog if available)
- [ ] Run `npm audit` and address high/critical vulnerabilities
- [ ] Deploy from a Git tag, never from `main` branch directly

---

## 12. Appendix A — `web.config` template

Place at `C:\inetpub\xrpname-mcp\iis-root\web.config`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>

    <!-- ARR proxy must be enabled in IIS Manager → Server → Application Request Routing Cache → Server Proxy Settings → Enable proxy. -->

    <rewrite>
      <rules>

        <!-- Redirect HTTP → HTTPS -->
        <rule name="HTTP to HTTPS redirect" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{HTTPS}" pattern="off" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:0}" redirectType="Permanent" />
        </rule>

        <!-- Reverse proxy everything else to Node.js on localhost:3000 -->
        <rule name="ReverseProxyToNode" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:3000/{R:1}" logRewrittenUrl="true" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" />
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
        </rule>

      </rules>

      <!-- IIS sometimes rewrites Location headers from upstream. Disable that. -->
      <outboundRules>
        <preConditions>
          <preCondition name="IsRedirection">
            <add input="{RESPONSE_STATUS}" pattern="3\d\d" />
          </preCondition>
        </preConditions>
        <rule name="ReverseProxyOutboundRule" preCondition="IsRedirection" stopProcessing="true">
          <match serverVariable="RESPONSE_LOCATION" pattern="^http://localhost:3000/(.*)" />
          <action type="Rewrite" value="https://{HTTP_HOST}/{R:1}" />
        </rule>
      </outboundRules>
    </rewrite>

    <!-- Security headers -->
    <httpProtocol>
      <customHeaders>
        <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="Referrer-Policy" value="no-referrer" />
      </customHeaders>
    </httpProtocol>

    <!-- Allow long-lived MCP HTTP connections (SSE streaming, etc.) -->
    <serverRuntime uploadReadAheadSize="0" />

    <!-- Allow request body up to ~1 MB (MCP payloads are small) -->
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="1048576" />
      </requestFiltering>
    </security>

  </system.webServer>
</configuration>
```

You must explicitly allow the rewrite to read server variables `HTTP_X_FORWARDED_*`. In IIS Manager → site → URL Rewrite → "View Server Variables" (right panel) → add:
- `HTTP_X_FORWARDED_HOST`
- `HTTP_X_FORWARDED_PROTO`
- `HTTP_X_FORWARDED_FOR`

Without this, IIS rejects the rewrite at runtime with HTTP 500.

---

## 13. Appendix B — `ecosystem.config.js` template (PM2)

Place at repo root `C:\inetpub\xrpname-mcp\ecosystem.config.js`:

```javascript
/**
 * PM2 ecosystem file for XRPName MCP server.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 reload xrpname-mcp           // zero-downtime restart
 *   pm2 logs xrpname-mcp             // tail logs
 *   pm2 save                          // persist process list to survive reboot
 */
module.exports = {
  apps: [
    {
      name: 'xrpname-mcp',
      script: 'dist/index.js',
      cwd: 'C:\\inetpub\\xrpname-mcp',
      instances: 1,
      exec_mode: 'fork',           // 'cluster' requires more work for Fastify; fork is fine for v1
      autorestart: true,
      watch: false,                 // do NOT watch in production
      max_memory_restart: '500M',
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: 10000,            // 10s — restart loop detection
      kill_timeout: 5000,           // graceful shutdown window

      env: {
        NODE_ENV: 'production',
        // Other env vars come from .env file loaded by the app
      },

      // Logs
      out_file: 'C:\\inetpub\\xrpname-mcp\\logs\\out.log',
      error_file: 'C:\\inetpub\\xrpname-mcp\\logs\\error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Log rotation (pm2-logrotate plugin, install once with `pm2 install pm2-logrotate`)
    }
  ]
};
```

Install log rotation once on the server:
```powershell
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14            # 14 days
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # midnight daily
```

---

## 14. Appendix C — `.env.example` template

Place at repo root `C:\inetpub\xrpname-mcp\.env.example` (committed) and copy to `.env` (gitignored) on the server.

```bash
# ----- Server -----
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# ----- OAuth -----
# Generate with PowerShell:
#   $bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
OAUTH_JWT_SECRET=REPLACE_WITH_32_BYTE_HEX
OAUTH_ISSUER=https://mcp.xrpdomains.xyz
OAUTH_ACCESS_TOKEN_TTL_SEC=3600
OAUTH_REFRESH_TOKEN_TTL_SEC=2592000

# ----- XRPDomains backend (existing API) -----
XRPDOMAINS_API_BASE=https://xrpdomains.xyz
XRPDOMAINS_TREASURY_ADDRESS=raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9

# ----- XRPL public servers -----
XRPL_WSS_URL=wss://xrplcluster.com
XRPL_BACKUP_WSS_URL=wss://s1.ripple.com

# ----- Redis (Memurai) -----
REDIS_URL=redis://localhost:6379

# ----- Rate limits (calls per minute per authenticated address) -----
RATE_LIMIT_READ_PER_MIN=60
RATE_LIMIT_TX_PER_MIN=20
RATE_LIMIT_WRITE_PER_MIN=10

# ----- Observability (optional) -----
# SENTRY_DSN=https://...
```

---

## 15. Appendix D — `deploy.ps1` PowerShell script

Place at `C:\inetpub\xrpname-mcp\scripts\deploy.ps1`. One-command updates.

```powershell
<#
.SYNOPSIS
  Deploy a new release of xrpname-mcp.

.EXAMPLE
  .\scripts\deploy.ps1 -Tag v1.0.1

.EXAMPLE
  .\scripts\deploy.ps1 -Tag main  # WARNING: only for staging
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$Tag,

    [switch]$SkipBackup,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = 'C:\inetpub\xrpname-mcp'
$BackupRoot  = 'C:\inetpub\xrpname-mcp-backups'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "!!  $msg" -ForegroundColor Yellow }

Set-Location $ProjectRoot

# 1. Pre-flight
Write-Step "Pre-flight checks"
if (-not (Test-Path .env)) { throw ".env file missing. Aborting." }
if (-not $Force) {
    pm2 ping > $null 2>&1
    if ($LASTEXITCODE -ne 0) { throw "PM2 not responsive. Run 'pm2 resurrect' first or pass -Force." }
}

# 2. Optional backup
if (-not $SkipBackup) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupDir = "$BackupRoot\$stamp"
    Write-Step "Snapshotting current dist/ to $backupDir"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -Recurse "$ProjectRoot\dist" $backupDir\dist
    Copy-Item "$ProjectRoot\package.json" $backupDir\package.json
    Copy-Item "$ProjectRoot\package-lock.json" $backupDir\package-lock.json
    Write-Ok "Backup at $backupDir"
}

# 3. Fetch + checkout
Write-Step "git fetch + checkout $Tag"
git fetch --all --tags
git checkout $Tag
git rev-parse --short HEAD | ForEach-Object { Write-Ok "HEAD = $_" }

# 4. Install + build
Write-Step "npm ci"
npm ci

Write-Step "npm run build"
npm run build

if (-not (Test-Path "$ProjectRoot\dist\index.js")) {
    throw "Build did not produce dist/index.js. Aborting before reload."
}

# 5. Zero-downtime reload
Write-Step "pm2 reload xrpname-mcp"
pm2 reload xrpname-mcp
pm2 save | Out-Null

# 6. Health probe
Write-Step "Health probe"
Start-Sleep -Seconds 3
$health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
if ($health.status -ne 'ok') {
    Write-Warn "Health probe failed: $($health | ConvertTo-Json -Compress)"
    Write-Warn "Consider rolling back: .\scripts\deploy.ps1 -Tag <previous>"
    exit 1
}

Write-Ok "Deploy $Tag complete"
```

Usage:
```powershell
cd C:\inetpub\xrpname-mcp
.\scripts\deploy.ps1 -Tag v1.0.1
```

---

## 16. Appendix E — `Caddyfile` reference (NOT used, here for context only)

The main spec (`XRPDomains-MCP-Server-Spec.md` §13) referenced a Caddy reverse proxy. We do not use it in this Windows IIS deployment. This appendix documents the equivalent so you can correlate the spec to what's actually deployed:

```
mcp.xrpdomains.xyz {
    reverse_proxy localhost:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
    }
}
```

Functionally identical to the IIS `web.config` in Appendix A — both terminate TLS, set security headers, and reverse-proxy to Node.js on port 3000.

---

## Done

After completing Steps 4-7 and verifying via Step 8, the MCP server is live at `https://mcp.xrpdomains.xyz/mcp` and ready for agents to connect.

For implementation questions about the application code itself (tool handlers, OAuth flow, error classification), see the main spec `XRPDomains-MCP-Server-Spec.md`. This document covers only the deploy/ops layer.

Questions / blocker? Tag the product owner before improvising changes to:
- DNS configuration
- IIS site bindings
- TLS cert handling
- Production `.env` values (especially `OAUTH_JWT_SECRET`)
