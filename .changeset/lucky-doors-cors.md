---
'@flaghoist/server': patch
---

Drop `Access-Control-Allow-Credentials` from CORS, and pin the opaque error response.

Flaghoist authenticates with headers (`x-api-key`, `Authorization`), which a browser does not attach
to a cross-origin request on its own, so `Access-Control-Allow-Credentials: true` bought nothing and
was a latent hole: the day a cookie or session flow is added, an allowlisted origin could ride an
ambient credential. An allowlisted origin still receives `Access-Control-Allow-Origin`, so
header-authenticated cross-origin reads are unaffected. Add the credentials header back only
alongside a deliberate credentialed flow.

Also adds a test pinning the server's opaque `{ error: 'Internal server error' }` response, so a
future change that returned an internal error message to the client would fail rather than leak.
