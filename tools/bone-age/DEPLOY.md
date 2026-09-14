# Deploying the Bone Age Tracker

No dependencies, no toolchain. `build.sh` is a file-copy script — it assembles
`dist/` and stamps the service worker. Run it locally any time:

```sh
sh build.sh      # -> dist/, prints the cache version it stamped
```

---

## Cloudflare Pages — the settings that matter

Pages → **Create a project** → **Connect to Git** → pick the repo, then:

| Field | Value |
|---|---|
| Framework preset | **None** |
| Build command | **`sh build.sh`** |
| Build output directory | **`dist`** |
| Production branch | **see the warning below** |
| Environment variables | none |

Netlify is identical and reads the same `_headers` and `_redirects`.

### ⚠ Set the production branch before the first deploy

Pages defaults the production branch to the repo's **default branch**. At the time
of writing this repo's default is `master`, and `master` does not contain
`tools/bone-age` at all.

Connect it without thinking and you get: production = the old portfolio, and this
app living only as a *preview* deployment on a random `*.pages.dev` subdomain — which
is not where you want a URL that is about to be printed in a book.

Do one of these **first**:

- merge the work into `master` and leave the production branch as `master`, or
- set **Settings → Builds & deployments → Production branch** to the branch that
  actually holds the app.

### Verify the first deploy

```sh
curl -sI https://<domain>/tools/bone-age/       | grep -i content-security-policy
curl -sI https://<domain>/tools/bone-age/sw.js  | grep -ci content-security-policy   # must print 1
curl -sI https://<domain>/bone-age              | grep -i location                   # must be a 302
curl -sI https://<domain>/tools/bone-age/ARCHITECTURE.md                             # must be 404
```

---

## What is published, and what is not

`build.sh` lists every public file **explicitly**. Nothing is copied by wildcard over
a whole directory, so adding a file to the repo never publishes it by accident.

Deliberately **not** published:

- `ARCHITECTURE.md`, `DEPLOY.md` — internal. They discuss IP ownership and commercial
  terms; deploying the repo root would put them at a guessable public URL.
- `Portfolio.html`, `stylesheet.css`, `jscript.js` — unrelated to this tool and must
  not appear on the publisher's domain.

If you add a file the public needs, add a `cp` line for it **and** a precache entry in
`sw.js`.

---

## Two things that will bite you

### 1. Never let two CSP headers match one path

When two `Content-Security-Policy` headers apply to the same response, the browser
enforces the **intersection**, not the more specific one.

So if the CSP lived on `/*`, its `connect-src 'none'` would *also* apply to `sw.js`,
intersect with the worker's `connect-src 'self'`, and come out as `'none'` — the
service worker would install and then silently fail to cache anything. Offline would
just quietly not work, with nothing in the console to say why.

That is why `_headers` puts the CSP only on the specific paths that need it, and why
`/*` carries the non-CSP headers only. **If you add a page, give it its own CSP line.
Do not be tempted to hoist the CSP up to `/*`.**

### 2. `sw.js` must never be cached

It is served `no-cache, no-store, must-revalidate`. A service worker cached by a CDN
or a browser pins itself in place — ship a broken one and you cannot push the fix,
because the broken copy is what serves the request for its own replacement.

---

## Cache versioning is automatic — do not do it by hand

`sw.js` in the repo reads:

```js
var CACHE = "boneage-__CACHE_VERSION__";
```

`build.sh` replaces the placeholder with a SHA-256 prefix of every file the worker
precaches, and fails the build if the substitution did not happen. So the cache name
changes exactly when the contents change, and never otherwise.

This matters because the `activate` handler deletes every cache that is not the
current one — the version change *is* what evicts the old shell from returning users'
devices. As a manual step it was a footgun: forget it and returning users keep the old
page indefinitely, while the person deploying sees the new one and notices nothing.

The worker does not call `skipWaiting()`, so a new version takes over on the next
launch rather than swapping under a tab holding a half-typed reading. That is
deliberate — a few minutes of staleness beats losing someone's input.

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

### Custom domain

Pages project → **Custom domains** → add the publisher's hostname, then create the
CNAME they give you in that domain's DNS. TLS is issued automatically. Do this
**before** the QR code is generated, so the printed URL is the real one from day one.

---

## Deploying without Git integration

If the repo must stay disconnected from Cloudflare:

```sh
sh build.sh
npx wrangler pages deploy dist --project-name=<project>
```

Same output, same headers. Needs a Cloudflare API token with the
**Cloudflare Pages: Edit** permission.

---

## Verifying it actually works

In Chrome DevTools on the deployed URL:

- **Application → Service workers** — status `activated and is running`
- **Application → Cache storage** — one `boneage-<hash>` cache holding 7 entries
- **Application → Manifest** — no errors, installability green
- **Network → tick Offline → reload** — the page still loads with saved data intact
- **Console** — run `fetch('https://example.com')`. It must be refused by CSP. That
  refusal is the privacy guarantee working; if it succeeds, the CSP is not deployed.
