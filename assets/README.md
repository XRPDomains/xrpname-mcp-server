# assets

Static assets bundled into the `.mcpb` package by `npm run pack`.

## icon.png

Place the XRPName logo here as **`icon.png`** — a square PNG, **256×256**
recommended (512×512 also fine), transparent background preferred.

`scripts/pack.mjs` auto-detects `assets/icon.png`: when present it copies the file
into the `.mcpb` bundle and adds `"icon": "icon.png"` to the manifest, so Claude
Desktop shows the logo on the extension card instead of a placeholder.

If this file is missing, `pack` still works — the manifest just omits the icon.
