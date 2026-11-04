// GET /api/health → setup check: keys present, seasons and grades found
import { getClubData, getInstagram, getInstagramError, config } from "../lib/playhq.js";
import { send } from "../lib/http.js";

export default async function handler(req, res) {
  let found = null;
  let error = null;
  if (config.hasKey) {
    try { found = (await getClubData()).found; } catch (e) { error = e.message; }
  }
  let instagramPosts = 0;
  if (config.hasInstagram) instagramPosts = (await getInstagram()).posts.length;
  send(res, 200, {
    ok: config.hasKey && !error,
    playhqKey: config.hasKey ? "set" : "missing (PLAYHQ_API_KEY)",
    instagram: { official: "official Instagram token", "wix-backup": "Wix backup (temporary)", none: "not set up" }[config.instagramSource],
    instagramPosts,
    instagramError: getInstagramError(),
    seasonsSetting: config.seasons.length ? config.seasons : "(auto: all current seasons)",
    found,
    error,
  });
}
