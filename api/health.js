// GET /api/health → setup check: keys present, seasons and grades found
import { getClubData, config } from "../lib/playhq.js";
import { send } from "../lib/http.js";

export default async function handler(req, res) {
  let found = null;
  let error = null;
  if (config.hasKey) {
    try { found = (await getClubData()).found; } catch (e) { error = e.message; }
  }
  send(res, 200, {
    ok: config.hasKey && !error,
    playhqKey: config.hasKey ? "set" : "missing (PLAYHQ_API_KEY)",
    instagram: config.hasInstagram ? "token set" : "no token (INSTAGRAM_ACCESS_TOKEN)",
    seasonsSetting: config.seasons.length ? config.seasons : "(auto: all current seasons)",
    found,
    error,
  });
}
