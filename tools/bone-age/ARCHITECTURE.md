<!-- Generic reference implementation. Contains no client material:
     no client name, branding, chapter text, or proprietary content. -->

# Bone Age Tracker — infrastructure, frontend, and data

Recommendation for the QR-code destination and for the larger app this could grow into.

---

## 1. The one decision everything else follows from

**No backend. No accounts. No data leaves the device.**

The app reads a date of birth, a child's name, and dated clinical measurements. That is
health data about a minor. The moment any of it touches a server, the project inherits a
compliance surface that a small handout tool cannot carry:

- **HIPAA** probably does not apply directly (a publisher distributing a
  handout is generally not a covered entity), but "probably" is doing a lot of work in that
  sentence, and the answer changes if a hospital ever co-brands it.
- **State law reaches further than HIPAA.** Washington's My Health My Data Act, Nevada
  SB 370, and California's CMIA cover consumer health data held by *non*-covered entities,
  with a private right of action in Washington's case.
- **The FTC Health Breach Notification Rule** applies specifically to health apps that are
  not HIPAA-covered.
- **COPPA** is in play the instant you store a child's identifiers with an account.

Storing nothing server-side removes all of it. There is no breach to notify, no BAA to
negotiate, no subject-access request to service, no retention policy to write. That is not
a shortcut — for this product it is the correct architecture, and it is also the thing that
will get it approved internally fastest.

Say it on the page, in plain words, where families can see it. It is a feature.

---

## 2. Infrastructure

### Hosting: Cloudflare Pages

Static files on a global CDN, free at this volume, TLS included.

Chosen over GitHub Pages for three specific reasons:

1. **Response headers.** GitHub Pages will not let you set them. You need them — see the CSP below.
2. **Redirect rules.** Essential for the printed QR code (next section).
3. **Cookieless analytics** built in, if any are wanted at all.

Netlify is an equivalent substitute. The requirement is headers + redirects, not the vendor.

### The printed QR code is permanent — design for that

Once the chapter is printed, that URL is immortal. Books sit in waiting rooms for a decade.

```
QR encodes:   https://<publisher-domain>/bone-age      ← never changes, never versioned
   302 →      https://<publisher-domain>/tools/bone-age/v1/
```

Rules:
- The domain must be one **the publisher owns**, not yours and not a URL shortener. A
  shortener is a single point of failure that can outlive its company; if it lapses, every
  printed copy points at whatever the new owner serves.
- The printed path carries **no version number and no query string**.
- Keep the redirect layer even if it feels pointless on day one. It is the only thing that
  lets you move, rename, or retire the app later without reprinting a book.
- Register the QR target and test it from an actual phone camera before the chapter goes to
  press, including on a locked-down hospital guest network.

### Content Security Policy — make the privacy claim enforceable

Serve this header. It converts "we don't send your data anywhere" from a promise into
something the browser enforces:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'none';
  form-action 'none';
  frame-ancestors 'none';
  base-uri 'none'
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
X-Content-Type-Options: nosniff
Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
```

`connect-src 'none'` is the load-bearing line: no fetch, no XHR, no WebSocket, no beacon.
Even a future dependency that tried to phone home would be blocked by the browser. If a
security reviewer at a partner hospital ever asks how you protect the data, this header is
the whole answer.

(`'unsafe-inline'` is there because the app is deliberately one self-contained file. If that
bothers a reviewer, move the CSS and JS to separate files and drop it — the tradeoff is a
file that no longer works when emailed around as an attachment.)

### No third-party requests at all

No Google Fonts, no CDN, no analytics script, no embedded map or video. Two reasons:

- A font request from `…/bone-age/` sends the referrer to a third party. The URL itself is
  not sensitive here, but it establishes a pattern of leaking, and it breaks the CSP above.
- Offline. Hospital basements and imaging suites have famously bad signal. A page with zero
  external requests plus a service worker works with no connection at all.

**Never add session replay** (Hotjar, FullStory, LogRocket, Clarity). These tools capture
form field contents by default. On this page that means a child's name and date of birth
streamed to a vendor. If anyone asks for analytics, offer Cloudflare Web Analytics: a page
count, no cookies, no per-user data, no form capture.

### Progressive Web App

A `manifest.json` plus a small cache-first service worker gets you:
- "Add to Home Screen" — the app reopens like a native app, which matters because families
  will not re-scan the QR code every time.
- Full offline operation.

Keep the service worker trivial (precache the shell, network-first for the HTML so updates
land). A clever service worker is a decade-long support liability.

### Cost

| | |
|---|---|
| Hosting | $0 (Cloudflare Pages free tier) |
| Domain | publisher already owns one |
| TLS | included |
| Backend | none |
| **Ongoing** | **$0/month** |

The realistic maintenance budget is a browser-compatibility check once a year.

---

## 3. Frontend

### Ship: one hand-written HTML file, no build step, no dependencies

`index.html` is ~850 lines including CSS and JS. That is the whole app.

This is a deliberate choice, not laziness:

- **It must outlive its own maintenance.** A React + Vite app nobody touches for three years
  is a wall of `npm audit` warnings and a build that no longer runs on a current Node. A
  single HTML file opens and works in 2035.
- **A printed QR code cannot be recalled.** Minimise what can rot behind it.
- **Zero supply chain.** No transitive dependency can be compromised, because there are none.
- **It is one file.** It can be emailed, put on a USB stick, or handed to the publisher's
  web person to drop anywhere. That portability is worth real money on a small budget.

Specific choices inside it:

| Concern | Choice | Why not the alternative |
|---|---|---|
| Chart | hand-built inline SVG, ~70 lines | Chart.js is ~200 KB for one scatter plot with a reference line |
| PDF | `window.print()` + a print stylesheet | jsPDF/html2canvas produce a raster image with worse type and no selectable text; the browser's own PDF export is better and free |
| State | one plain object + `localStorage` | no framework needed for ~10 rows of data |
| Dates | hand-rolled, calendar-correct | date-fns is 20× the size of the one function actually needed |
| Styling | CSS custom properties, light/dark | no Tailwind build step |

### The date arithmetic is the part to get right

The original spreadsheet used `(x-ray date − DOB) / 365`. That drifts, and more importantly
it does not return a clean answer on a birthday. This version walks real calendar
anniversaries, so the 6th birthday is exactly `6.000`, leap years handle themselves, and
`(BA − CA) × 12` is a number you can defend to an endocrinologist.

The other trap, which bites everyone: `new Date("2024-04-15")` is parsed as **UTC**, so
west of Greenwich it lands on 14 April and every age shifts by a day. Dates are parsed
field-by-field into local time. There is a unit test for this.

### Validation is the actual feature request

"Make inputting data easier" mostly means "stop people entering the wrong thing." The rules
that matter, all of which the spreadsheet could not enforce:

- bone age given in months (`69`) instead of years — caught by comparing against
  chronological age and rejecting a gap over 6 years
- extra months outside 0–11
- x-ray dated before birth, or in the future
- calendar dates that do not exist (31 February)
- two results on the same date
- every message says what to do next, not just what is wrong

### When to graduate to a framework

Not for this. Reach for a build step at the **third** module sharing a shell — at that point
you have real routing, shared components, and shared state. Then: Vite + TypeScript +
**Preact or Svelte** (not React — bundle size still matters on hospital wifi), and keep the
no-external-requests rule.

### Accessibility and reach

Already in: keyboard-reachable chart points with spoken labels, a table that carries every
value the chart shows, ≥44px touch targets, visible focus rings, a real dark mode, no
horizontal scrolling at 390px, and colour never used as the only signal.

Worth adding if this goes wide: the audience is international, so keep every string
in one place to make translation a data change rather than a rewrite. Spanish first.

### One editorial rule

The app describes, it never interprets. "Bone age is 5.4 months behind chronological age" is
arithmetic. "Bone age is delayed" is a clinical judgement, and what counts as expected varies
enormously between conditions — a delay that is reassuring in one diagnosis is a finding in
another. Keep the output descriptive and point at the doctor. This is a product rule and a
liability rule at the same time.

---

## 4. Data

### Client-side document (this is the whole data model today)

Stored at `localStorage["boneage.v1"]`:

```jsonc
{
  "schemaVersion": 1,
  "child": {
    "name": "Sam",          // optional, free text, never required
    "dob":  "2016-12-20"    // ISO yyyy-mm-dd, local
  },
  "readings": [
    {
      "id":       "rlz9k2a0x4",   // stable local id, survives sorting and editing
      "date":     "2024-04-15",   // date of the x-ray
      "baYears":  7,              // exactly as the report worded it
      "baMonths": 2,
      "notes":    "Read by Dr Okafor."
    }
  ],
  "updatedAt": "2026-09-14T18:20:00.000Z"
}
```

Four design rules in that shape:

1. **Store what was reported, derive everything else.** `baYears`/`baMonths` are the
   radiologist's words. Chronological age, the difference, the deltas, and the rate are
   recomputed on every render and never persisted. Fix a bug in the maths and every historical
   row is corrected automatically — the spreadsheet could not do that.
2. **`schemaVersion` from day one**, with a `migrate()` function that already exists and is
   already called. Version 2 branches there. Nobody ever loses a reading.
3. **The export file is byte-identical to the stored document.** Backup, restore, and
   "send it to my spouse" are the same code path. No transform, so no transform bugs.
4. **Namespaced key** (`boneage.v1`) so a second module on the same origin cannot collide.

`localStorage` reads and writes are wrapped in `try/catch` throughout: it throws in private
mode and in browsers with site data blocked. The app degrades to working-but-not-saving
rather than showing a blank screen.

CSV export exists separately, for the clinician who wants the numbers in their own tools. It
is an export format only — never an import format.

### If accounts ever become unavoidable

Only if families actually ask, and only if the publisher will fund the ongoing compliance
work. Do not build it speculatively. If it happens:

**Stack:** Supabase (Postgres + row-level security + auth) or Cloudflare D1 + Workers. Supabase
offers a BAA on paid plans; sign it even if you think you don't need it.

**Schema — designed so the bone age tracker is one row type among many:**

```sql
create table profiles (
  id          uuid primary key references auth.users,
  created_at  timestamptz not null default now()
);

create table subjects (                       -- "the child", deliberately not named that
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  label       text not null,                  -- "Sam" or "child 1" — user's choice
  birth_year  smallint,                       -- YEAR ONLY. see below
  created_at  timestamptz not null default now()
);

create table observations (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references subjects(id) on delete cascade,
  kind          text not null,                -- 'bone_age' | 'height' | 'weight' | 'puberty_stage' | 'lab'
  observed_on   date not null,
  age_years     numeric(5,3) not null,        -- age AT observation, computed on the client
  value         jsonb not null,               -- shape depends on kind
  notes         text,
  created_at    timestamptz not null default now()
);

create index on observations (subject_id, kind, observed_on);
alter table subjects     enable row level security;
alter table observations enable row level security;
-- every policy: owner_id = auth.uid(), reached through subject_id for observations
```

`observations.kind` + `jsonb value` is the platform hook. A bone age row is
`{"years": 7, "months": 2, "method": "greulich-pyle"}`. Height is `{"cm": 118.4}`. Adding the
growth-velocity module is a new `kind`, not a new table, not a migration.

**Data minimisation — what deliberately does not go to the server:**

| Field | Where it lives | Why |
|---|---|---|
| Child's full name | client only (`label` is whatever the user types) | never needed server-side |
| **Exact date of birth** | **client only** | DOB + name is the identifier pair that makes a breach serious |
| Age at each observation | server (`age_years`) | computed on the client; gives you every chart without the DOB |
| Raw measurement | server (`value`) | meaningless without the identity fields above |

That table is the design. The server can draw every chart the app draws and still holds no
direct identifier — so a full database dump is close to useless to an attacker. Build it this
way from the first migration; retrofitting minimisation is never done.

---

## 5. Suggested sequence

| Phase | Scope | Effort |
|---|---|---|
| **1** | This app. Fixed vanity URL + redirect, CSP, PWA, done. | shipped |
| **2** | Publisher review, a real-family usability pass (5 parents, watch them on phones), Spanish. | ~1 week |
| **3** | Second module (growth velocity / height percentile) as a sibling page, sharing CSS and the storage pattern but still no backend. | ~2 weeks |
| **4** | Only if 2–3 modules exist *and* families ask for cross-device sync: extract a shell, add the schema above. | re-scope then |

Phase 4 is the one to resist. Everything before it costs $0/month to run and carries no
personal data. That is a rare position to be in — give it up only for a concrete, demonstrated
need, not for a roadmap slide.

---

## 6. Open commercial questions

1. **IP split.** The chapter content and the handout design belong to the publisher. If a
   reusable shell emerges in phase 3–4, agree *in writing, before phase 3* who owns the shell
   versus the module content. Otherwise it cannot be reused for the next chapter or the next
   client.
2. **Who owns the domain and the redirect.** It must be the publisher. Get it in writing —
   it is printed in a book.
3. **Maintenance.** Even a zero-dependency app needs an annual browser check. Agree who does
   it and what happens if you stop being available.
4. **Medical review.** Someone clinical on the publisher's side should sign off on the exact wording
   of the summary line and the disclaimer before it is published.
