/* Bone Age Tracker service worker.
 *
 * Deliberately boring. Its only jobs are to make the app open with no network
 * (imaging suites and hospital basements have terrible signal) and to keep
 * working after the tab is closed. It never talks to any origin but its own.
 *
 * Note it does NOT call skipWaiting(): a new version activates on the next
 * launch rather than swapping under a tab that may have a half-typed reading
 * in the form.
 */
/* build.sh replaces the placeholder with a hash of the precached files, so the
   cache name changes exactly when the contents do and can never be forgotten.
   Left unreplaced (opening this repo directly) it is still a valid cache name -
   it simply never invalidates, which is correct for local work. */
var CACHE = "boneage-__CACHE_VERSION__";

var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // Individually, so one missing file cannot fail the whole install.
      return Promise.all(ASSETS.map(function(url){
        return c.add(new Request(url, {cache:"reload"}))["catch"](function(){});
      }));
    })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  if(new URL(req.url).origin !== self.location.origin) return;

  // Navigations: network first, so a deployed update is picked up straight
  // away, with the cached shell as the offline fallback.
  if(req.mode === "navigate"){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put("./index.html", copy); });
        return res;
      })["catch"](function(){
        return caches.match("./index.html").then(function(hit){
          return hit || Response.error();
        });
      })
    );
    return;
  }

  // Everything else (icons, manifest): cache first, they are immutable per version.
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      })["catch"](function(){ return Response.error(); });
    })
  );
});
