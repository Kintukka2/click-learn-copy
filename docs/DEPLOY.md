# Deploying Steplight at `examplewebsite.app/steplight`

Steplight is a Node server that drives a headless Chromium for recording, Replay, PDF and video exports. It needs a machine that stays switched on: a small VPS, a home server, or your own computer while you test. Cloudflare then puts it on your domain. You don't need to open any ports.

```
phone / browser ──► examplewebsite.app/steplight/…  (Cloudflare)
                        │  Worker route: only /steplight* is forwarded
                        ▼
                    steplight-origin.examplewebsite.app  (Cloudflare Tunnel)
                        │  outbound-only connection from your machine
                        ▼
                    Docker: steplight  ← serves everything under /steplight
```

Everything else on `examplewebsite.app` keeps working as before; only `/steplight…` goes to Steplight.

## 1. Run Steplight (Docker)

On the machine that will host it, with Docker installed:

```bash
git clone https://github.com/Kintukka2/click-learn-copy.git && cd click-learn-copy
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`:

| Setting | Value |
|---|---|
| `STEPLIGHT_BASE_URL` | `https://examplewebsite.app/steplight`. The path after the domain is the prefix. |
| `STEPLIGHT_ACCESS_KEY` | A long random string. You enter it once on the Studio sign-in page. Learners never need it. |
| `STEPLIGHT_PUBLISHER` | Optional. Your name or company, shown in the extension's privacy policy at `/steplight/privacy`. |
| `STEPLIGHT_CONTACT_EMAIL` | Optional. The contact address shown in that privacy policy. |
| `TUNNEL_TOKEN` | From step 2. |
| `ANTHROPIC_API_KEY` | Optional. Turns on Claude for AI help answers and translations. |

You'll start it at the end of step 2, once you have the token.

## 2. Create a Cloudflare Tunnel

1. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels → Create a tunnel**.
2. Choose **Cloudflared** and name the tunnel `steplight`.
3. On the install screen, pick **Docker** and copy the token. It's the long string after `--token` in the command shown. Put it in `deploy/.env` as `TUNNEL_TOKEN`.
4. Add a **public hostname** (newer dashboards may call it a published application route):

   | Field | Value |
   |---|---|
   | Subdomain | `steplight-origin` |
   | Domain | `examplewebsite.app` |
   | Path | leave empty |
   | Service | type **HTTP**, URL `steplight:4100` |

Then start both containers:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

After about a minute, `https://steplight-origin.examplewebsite.app/steplight/api/health` returns `{"ok":true,…}`.

## 3. Route `examplewebsite.app/steplight` to it (Cloudflare Worker)

**From the dashboard (works from a phone):**

1. Go to **Workers & Pages → Create → Worker**, name it `steplight-proxy`, then **Deploy**.
2. Open **Edit code**, replace the code with the contents of [`deploy/cloudflare-worker/worker.js`](../deploy/cloudflare-worker/worker.js), and deploy again.
3. Under **Settings → Variables and secrets**, add `STEPLIGHT_ORIGIN` = `https://steplight-origin.examplewebsite.app`.
4. Under **Settings → Domains & Routes → Add → Route**, set the route to `examplewebsite.app/steplight*` and the zone to `examplewebsite.app`.
5. A Worker route only runs on a hostname that has a proxied DNS record. If `examplewebsite.app` doesn't serve a site yet (the browser shows `DNS_PROBE_FINISHED_NXDOMAIN`), go to **examplewebsite.app → DNS → Records → Add record** and add type `AAAA`, name `@`, IPv6 address `100::`, with proxy status **Proxied**. `100::` is Cloudflare's placeholder for hostnames that are served entirely by Workers.

**Or from a computer:**

```bash
cd deploy/cloudflare-worker && npx wrangler login && npx wrangler deploy
```

(`wrangler.toml` already contains the route and the origin.)

## 4. Try it

| URL | What it is | Needs the key |
|---|---|---|
| `https://examplewebsite.app/steplight/` | Studio (sign in with your access key) | yes |
| `https://examplewebsite.app/steplight/demo-erp/` | Northwind ERP demo app | no |
| `https://examplewebsite.app/steplight/portal/<project id>/` | Published learning portal | no |

In the Studio, click **Create sample project**. The server records five processes in its own headless browser, which takes about 20 seconds. Then open a process and use **Preview**, **Guide me** and **Export**, or publish the portal and open it on your phone.

### On a phone

- **Works on a phone:** the portal, the Show Me / Try Me / Test Me players, Assist ("Guide me in the app") and the demo app. The sample project can also be created from a phone, because the recording runs on the server.
- **Desktop only:** the Studio is designed for a desktop screen, though it works on tablets. Recording your own processes uses the Chrome/Edge extension, and mobile browsers can't run extensions.

### Recording with the browser extension

In the extension popup, open **Settings** and enter:

- **Server URL:** `https://examplewebsite.app/steplight`
- **Access key:** your key

Learners enter only the server URL. Without the access key, the popup shows guides only: **Record** and **Open Studio** stay hidden. Publishing the extension in the Chrome Web Store is covered in [WEB-STORE.md](WEB-STORE.md).

## Notes

- **Your data** (projects, screenshots, published portals) is stored in the `steplight-data` Docker volume. Back it up with `docker run --rm -v deploy_steplight-data:/d -v "$PWD":/b alpine tar czf /b/steplight-data.tgz -C /d .`.
- **Updating:** run `git pull`, then the same `docker compose … up -d --build` command.
- **The server's own browser** (recording, Replay, exports) connects to the server directly on `127.0.0.1`, not through the internet. Cloudflare bot protection therefore can't interfere with it.
- **Without Cloudflare:** run `STEPLIGHT_BASE_URL=https://your.host/steplight STEPLIGHT_ACCESS_KEY=… npm start` behind any reverse proxy that forwards `/steplight/*` unchanged.
- **Skipping the Worker:** if nothing else is served at `examplewebsite.app`, you can give the tunnel's public hostname the root domain with the path `steplight` and leave out step 3. The Worker route is the safer choice when the domain already serves a site.
