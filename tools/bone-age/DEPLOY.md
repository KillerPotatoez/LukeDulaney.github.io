# Deploying the Bone Age Tracker

Static files. No build step, no server, no environment variables.

Files that matter:

```
_headers                      (repo root) security headers + CSP
_redirects                    (repo root) the permanent QR-code path
tools/bone-age/index.html     the app
tools/bone-age/sw.js          offline support
tools/bone-age/manifest.webmanifest
tools/bone-age/icon-*.png, apple-touch-icon.png
```

---

## Cloudflare Pages

1. Pages → **Create a project** → connect the repo.
2. Framework preset **None**, build command **empty**, output directory **`/`**.
3. Deploy. `_headers` and `_redirects` are picked up automatically from the output root.

Netlify is identical and reads the same two files.

Verify after the first deploy:

```bash
curl -sI https://<domain>/tools/bone-age/ | grep -i content-security-policy
curl -sI https://<domain>/tools/bone-age/sw.js | grep -ci content-security-policy   # must print 1
curl -sI https://<domain>/bone-age                                                  # must be 302
```

---

## Two things that will bite you

### 1. Never let two CSP headers match one path

When two `Content-Security-Policy` headers apply to the same response, the browser
enforces the **intersection**, not the more specific one.

So if the CSP lived on `/*`, its `connect-src 'none'` would *also* apply to `sw.js`,
intersect with the worker's `connect-src 'self'`, and come out as `'none'` — the
service worker would install and then silently fail to cache anything. Offline would
just quietly not work, with no error anyone would notice.

That is why `_headers` puts the CSP only on the specific paths that need it, and why
`/*` carries the non-CSP headers only. **If you add a page, give it its own CSP line.
Do not be tempted to hoist the CSP up to `/*`.**

### 2. `sw.js` must never be cached

It is served `no-cache, no-store, must-revalidate`. A service worker cached by a CDN
or a browser pins itself in place — ship a broken one and you cannot push the fix,
because the broken copy is what serves the request for its own replacement.

---

## Changing the app after it is live

The cache name in `sw.js` is the version marker:

```js
var CACHE = "boneage-v1";
```

**Bump it on every deploy that changes `index.html`** (`boneage-v2`, and so on). The
`activate` handler deletes every cache that is not the current one, so the bump is what
evicts the old shell. Forget it and returning users keep the old page indefinitely.

The worker does not call `skipWaiting()`, so a new version takes over on the next
launch rather than swapping under a tab with a half-typed reading in the form. That is
deliberate — for this app a few minutes of staleness beats losing someone's input.

---

## The QR code

```
printed in the chapter:   https://<domain>/bone-age
                 302 →    https://<domain>/tools/bone-age/
```

Rules, all of which exist because **a printed QR code cannot be recalled**:

- the domain must be one the publisher owns — never yours, never a URL shortener
  (a shortener's company can fold, and then every printed copy points at whoever buys
  the domain next)
- the printed path carries no version number and no query string
- it is a **302, not a 301** — a 301 is cached by browsers effectively forever, which
  would defeat the point of having a redirect at all
- test it from a real phone camera, on a hospital guest network, before the chapter
  goes to press

---

## If the app is deployed on its own domain

If `tools/bone-age/` becomes the site root, move `_headers` and `_redirects` alongside
it and strip the prefix from every path:

```
/                     →  the page CSP
/index.html           →  the page CSP
/sw.js                →  the worker CSP, no-store
```

`index.html`, `sw.js` and `manifest.webmanifest` use relative URLs throughout, so
nothing inside them needs editing.

---

## Verifying it actually works

In Chrome DevTools on the deployed URL:

- **Application → Service workers** — status `activated and is running`
- **Application → Cache storage** — `boneage-v1` holds 7 entries
- **Application → Manifest** — no errors, installability green
- **Network → tick Offline → reload** — the page still loads with saved data intact
- **Console** — run `fetch('https://example.com')`. It must be refused by CSP. That
  refusal is the privacy guarantee working; if it succeeds, the CSP is not deployed.
