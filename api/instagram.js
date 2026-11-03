// GET /api/instagram → latest posts from @riversidebluescc (empty list until a token is set)
import { getInstagram } from "../lib/playhq.js";
import { send } from "../lib/http.js";

export default async function handler(req, res) {
  const data = await getInstagram();
  send(res, 200, data, data.posts.length ? 900 : 60);
}
