// GET /api/club-data → next match, latest results, upcoming fixtures and ladders
import { getClubData, config } from "../lib/playhq.js";
import { send, fail } from "../lib/http.js";

export default async function handler(req, res) {
  if (!config.hasKey) return send(res, 500, { error: "PLAYHQ_API_KEY is not set" });
  try {
    const { found, ...data } = await getClubData(); // "found" is only for /api/health
    send(res, 200, data, config.cacheSeconds);
  } catch (err) {
    fail(res, err);
  }
}
