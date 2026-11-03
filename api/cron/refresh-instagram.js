// Weekly Vercel Cron job (see vercel.json): keeps the Instagram token alive.
import { refreshInstagramToken } from "../../lib/playhq.js";
import { send } from "../../lib/http.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return send(res, 401, { error: "Unauthorized" });
  }
  const result = await refreshInstagramToken();
  console.log("Instagram token refresh:", JSON.stringify(result));
  send(res, result.ok ? 200 : 500, result);
}
