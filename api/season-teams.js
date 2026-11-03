// GET /api/season-teams?season=<id> → Riverside's teams in that season
import { getSeasonTeams, config, UUID_RE } from "../lib/playhq.js";
import { send, fail, query } from "../lib/http.js";

export default async function handler(req, res) {
  if (!config.hasKey) return send(res, 500, { error: "PLAYHQ_API_KEY is not set" });
  const season = query(req, "season");
  if (!UUID_RE.test(season)) return send(res, 400, { error: "Invalid season" });
  try {
    send(res, 200, { teams: await getSeasonTeams(season) }, 3600);
  } catch (err) {
    fail(res, err);
  }
}
