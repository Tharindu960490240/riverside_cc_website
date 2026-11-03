// GET /api/filters → every season Riverside has played in (association, competition, season)
import { getFilterOptions, config } from "../lib/playhq.js";
import { send, fail } from "../lib/http.js";

export default async function handler(req, res) {
  if (!config.hasKey) return send(res, 500, { error: "PLAYHQ_API_KEY is not set" });
  try {
    send(res, 200, await getFilterOptions(), 3600);
  } catch (err) {
    fail(res, err);
  }
}
