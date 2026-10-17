// Serves Steplight at https://<your domain>/steplight/* while the rest of the site stays as it is.
// The route (wrangler.toml) sends only /steplight* here; everything else never reaches this Worker.
// STEPLIGHT_ORIGIN is where Steplight actually runs, e.g. a Cloudflare Tunnel hostname such as
// https://steplight-origin.examplewebsite.app (the path is kept, so the server must use the same prefix).
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const origin = new URL(env.STEPLIGHT_ORIGIN);
    const target = new URL(incoming.pathname + incoming.search, origin);

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", incoming.host);
    headers.set("X-Forwarded-Proto", "https");

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: "manual", // Steplight sends path-only redirects, which stay on your domain
    });
    return new Response(upstream.body, upstream);
  },
};
