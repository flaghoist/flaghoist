/**
 * The read playground: a small self-contained page the demo worker serves at `/`. It calls the same
 * OFREP endpoint an app would, so a visitor can toggle a flag in the dashboard and watch the
 * evaluated value change here, which is the half of the product an admin-only demo hides.
 *
 * No external requests (no CDN, matching the rest of Flaghoist). The read key is public on the demo,
 * so it is injected straight into the page; the page is same origin as the API, so no CORS is
 * involved. Client script avoids template literals so it survives being embedded in this one.
 */
export function playgroundHtml(readKey: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Flaghoist read playground</title>
<meta name="color-scheme" content="light" />
<style>
  :root {
    --bg: #ffffff; --panel: #f8fafc; --line: #e2e8f0; --text: #0f172a;
    --muted: #64748b; --signal: #ff4a1f; --on: #16a34a; --off: #64748b;
    --code: #f1f5f9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .brand { font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
  .brand .accent { color: var(--signal); }
  a.dash {
    display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none;
    color: var(--text); border: 1px solid var(--line); border-radius: 8px;
    padding: 0.45rem 0.8rem; font-weight: 600; font-size: 0.9rem; background: var(--panel);
  }
  a.dash:hover { border-color: var(--text); }
  .lede { color: var(--muted); margin: 0.35rem 0 1.5rem; max-width: 60ch; }
  .controls {
    display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: end;
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 1rem;
  }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  .field label { font-size: 0.75rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .field input, .field select {
    background: var(--code); color: var(--text); border: 1px solid var(--line);
    border-radius: 8px; padding: 0.5rem 0.6rem; font-size: 0.9rem; min-width: 10rem;
    font-family: inherit;
  }
  button.eval {
    background: var(--signal); color: #fff; border: 0; border-radius: 8px;
    padding: 0.55rem 1.1rem; font-weight: 700; font-size: 0.9rem; cursor: pointer;
  }
  button.eval:hover { filter: brightness(1.08); }
  .results { display: grid; gap: 0.75rem; margin: 1.25rem 0; }
  .card {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 0.9rem 1.1rem;
  }
  .card .key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
  .card .reason { color: var(--muted); font-size: 0.78rem; margin-top: 0.15rem; }
  .pill {
    font-weight: 700; font-size: 0.8rem; padding: 0.25rem 0.7rem; border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .pill.on { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .pill.off { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
  h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 1.5rem 0 0.5rem; }
  pre {
    background: var(--code); border: 1px solid var(--line); border-radius: 10px;
    padding: 0.9rem 1rem; overflow-x: auto; font-size: 0.8rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #334155;
  }
  .note { color: var(--muted); font-size: 0.85rem; }
  .note a { color: var(--signal); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">Flag<span class="accent">hoist</span> read playground</div>
    <a class="dash" href="/admin">Open the admin dashboard &rarr;</a>
  </header>
  <p class="lede">
    This is what your app sees. It calls the same OFREP read endpoint any OpenFeature SDK would.
    Toggle a flag in the dashboard, then watch its value change here.
  </p>

  <div class="controls">
    <div class="field">
      <label for="tk">targetingKey</label>
      <input id="tk" value="tester-1" />
    </div>
    <div class="field">
      <label for="plan">plan (for targeting)</label>
      <select id="plan">
        <option value="">none</option>
        <option value="free">free</option>
        <option value="pro">pro</option>
      </select>
    </div>
    <button class="eval" id="go">Evaluate</button>
  </div>

  <div class="results" id="results" aria-live="polite"></div>

  <h2>The exact request your app makes</h2>
  <pre id="curl"></pre>
  <p class="note">
    Same call from any language through its OpenFeature provider. See the client guides at
    <a href="https://docs.flaghoist.dev/clients">docs.flaghoist.dev/clients</a>.
    On the live demo a change can take up to about 30 seconds to reach every edge, which is normal
    for Cloudflare KV.
  </p>
</div>

<script>
  var READ_KEY = ${JSON.stringify(readKey)};
  var results = document.getElementById('results');
  var curlEl = document.getElementById('curl');
  var tk = document.getElementById('tk');
  var plan = document.getElementById('plan');

  function context() {
    var ctx = { targetingKey: tk.value || 'tester-1' };
    if (plan.value) ctx.plan = plan.value;
    return ctx;
  }

  function pill(value) {
    var span = document.createElement('span');
    span.className = 'pill ' + (value ? 'on' : 'off');
    span.textContent = value ? 'true' : 'false';
    return span;
  }

  function render(flags) {
    results.innerHTML = '';
    if (!flags.length) {
      results.innerHTML = '<div class="card"><span class="reason">No flags yet. Create one in the dashboard.</span></div>';
      return;
    }
    flags.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    flags.forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'card';
      var left = document.createElement('div');
      var key = document.createElement('div');
      key.className = 'key';
      key.textContent = f.key;
      var reason = document.createElement('div');
      reason.className = 'reason';
      reason.textContent = 'reason: ' + (f.reason || '-') + '   variant: ' + (f.variant || '-');
      left.appendChild(key);
      left.appendChild(reason);
      card.appendChild(left);
      card.appendChild(pill(f.value === true));
      results.appendChild(card);
    });
  }

  function updateCurl(ctx) {
    var body = JSON.stringify({ context: ctx });
    curlEl.textContent =
      'curl -X POST ' + location.origin + '/ofrep/v1/evaluate/flags \\\\\\n' +
      '  -H "x-api-key: ' + READ_KEY + '" \\\\\\n' +
      '  -H "content-type: application/json" \\\\\\n' +
      "  -d '" + body + "'";
  }

  function evaluate() {
    var ctx = context();
    updateCurl(ctx);
    fetch('/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: { 'x-api-key': READ_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ context: ctx })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { render(d.flags || []); })
      .catch(function () {
        results.innerHTML = '<div class="card"><span class="reason">Request failed. Is the server running?</span></div>';
      });
  }

  document.getElementById('go').addEventListener('click', evaluate);
  tk.addEventListener('keydown', function (e) { if (e.key === 'Enter') evaluate(); });
  plan.addEventListener('change', evaluate);

  evaluate();
</script>
</body>
</html>`
}
