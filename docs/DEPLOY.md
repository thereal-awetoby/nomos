# Deploying the app

The app is a static single-page site. Any static host works.

## Build

Node.js 22 or newer.

```bash
cd frontend
npm ci
npm run build        # type check, then the site in frontend/dist
```

Publish the contents of `frontend/dist`.

## Settings (build-time environment variables)

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_BCH_NETWORK` | `mainnet` | The default network. Visitors can switch to chipnet, the test network, from the header; the choice is kept in their browser. |
| `VITE_WC_PROJECT_ID` | a WalletConnect (Reown) project ID | Optional. Without it the WalletConnect buttons are hidden; Paytaca over WizardConnect and browser wallets on Base still work. |

Vite reads these at build time, so set them before `npm run build` (in the host's build settings, or in `frontend/.env`). Changing them later needs a new build.

## Routes

Every path (`/identity`, `/bridge?offer=…`, `/simulate`, …) must serve `index.html`. The build already includes the rule for the common hosts:

| Host | What handles it |
| --- | --- |
| Netlify | `_redirects` (in `dist/`) |
| Cloudflare Pages | Built in for single-page apps; `_redirects` is harmless |
| Vercel | `frontend/vercel.json` (set the project's root directory to `frontend`) |
| Apache | `.htaccess` (in `dist/`) |
| nginx | add `try_files $uri $uri/ /index.html;` to the site's `location /` |
| Caddy | add `try_files {path} /index.html` before `file_server` |

## Check after deploying

Open each of these directly in a new tab, not by clicking through the app. Each should show the Nomos page, not a 404:

- `https://nomos.asgaya.org/simulate`
- `https://nomos.asgaya.org/identity`
- `https://nomos.asgaya.org/bridge`
- `https://nomos.asgaya.org/proof`
- `https://nomos.asgaya.org/architecture`

The page title should read **Nomos · Spending rules for Bitcoin Cash**. If it still says "The Law of the Payment", the old build is being served or cached.
