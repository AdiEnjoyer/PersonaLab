# Chess.com CORS proxy (optional)

PersonaLab calls the Chess.com public API directly. Some browsers block that (CORS). If syncing fails with
"Could not reach Chess.com ... a CORS proxy is needed", deploy this small Cloudflare Worker. It is free
(Workers free tier: 100,000 requests per day) and needs no credit card.

What it does: it forwards only `GET https://api.chess.com/pub/...` and adds an `Access-Control-Allow-Origin`
header for your app. Every other method or path gets HTTP 403 and nothing is sent to Chess.com. It stores nothing.

## Deploy

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Open a terminal in this `worker/` folder (Node.js 20 or newer is needed).
3. Edit `wrangler.toml` and set `ALLOWED_ORIGIN` to the address your app is served from, origin only, for example
   `https://yourname.github.io` (no `/PersonaLab` path, no trailing slash).
4. Log in: `npx wrangler login`. A browser tab opens; allow access.
5. Deploy: `npx wrangler deploy`.
6. Wrangler prints the worker address, like `https://personalab-chess-proxy.<your-subdomain>.workers.dev`. Copy it.
7. Check it in a browser: open `<that address>/pub/player/adichesslarper`. You should see JSON from Chess.com.
   Opening `<that address>/` should show "Forbidden".
8. In PersonaLab open Settings, then Chess, paste the address into "CORS proxy URL" (it must start with `https://`)
   and leave the field. The proxy is only used when a direct request fails.

## Change the app address later

Edit `ALLOWED_ORIGIN` in `wrangler.toml` and run `npx wrangler deploy` again.

## Test

From the repository root: `npx vitest --run --project worker`.
