/** Small response helpers shared by the /api functions (work on Vercel and in dev-server.js). */
export function query(req, name) {
  return new URL(req.url, "http://localhost").searchParams.get(name) || "";
}

/**
 * Sends JSON. cacheSeconds > 0 lets Vercel's CDN cache the answer and keep serving
 * the last good copy while it fetches a fresh one, so PlayHQ is called rarely.
 */
export function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    status === 200 && cacheSeconds > 0
      ? `public, max-age=60, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`
      : "no-store"
  );
  res.end(JSON.stringify(body));
}

export function fail(res, err) {
  console.error(err);
  if (err?.status === 404) return send(res, 404, { error: err.message });
  send(res, 502, { error: "Could not load data from PlayHQ. Please try again shortly." });
}
