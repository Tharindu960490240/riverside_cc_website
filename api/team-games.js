// GET /api/team-games?season=<id>&team=<id> → that team's full fixture, results and byes
import { getTeamGames, config, UUID_RE } from "../lib/playhq.js";
import { send, fail, query } from "../lib/http.js";

export default async function handler(req, res) {
  if (!config.hasKey) return send(res, 500, { error: "PLAYHQ_API_KEY is not set" });
  const season = query(req, "season");
  const team = query(req, "team");
  if (!UUID_RE.test(season) || !UUID_RE.test(team)) return send(res, 400, { error: "Invalid season or team" });
  try {
    send(res, 200, await getTeamGames(season, team), config.cacheSeconds);
  } catch (err) {
    fail(res, err);
  }
}
