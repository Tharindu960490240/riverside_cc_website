// POST /api/contact → emails a contact-form message to the club (via Resend, resend.com)
//
// Environment variables:
//   RESEND_API_KEY      required — from resend.com → API Keys
//   CONTACT_TO_EMAIL    required — where messages go (one or more, comma-separated)
//   CONTACT_FROM_EMAIL  optional — e.g. "Riverside CC Website <website@riversidebluescc.com>"
//                                  (needs that domain verified in Resend; the default works without one)
import { send } from "../lib/http.js";

const TOPICS = {
  general: "General enquiry",
  joining: "Joining or registration",
  juniors: "Juniors and Master Blasters",
  sponsorship: "Sponsorship and advertising",
  ground: "Ground hire or clubrooms",
  other: "Something else",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Best-effort limit: 5 messages per address per 10 minutes on each server instance
const recent = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 1000) recent.clear();
  return list.length > 5;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel parses JSON bodies
  if (typeof req.body === "string") return JSON.parse(req.body);
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) throw new Error("too large");
  }
  return JSON.parse(raw || "{}");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Use POST." });
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "Sorry, we couldn't read that message." });
  }

  // Spam trap: the hidden "website" field is only ever filled in by bots
  if (body.website) return send(res, 200, { ok: true });

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 30);
  const message = clean(body.message, 3000);
  const topic = TOPICS[body.topic] ? body.topic : "general";

  if (!name) return send(res, 400, { error: "Please enter your name." });
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: "Please enter a valid email address." });
  if (message.length < 5) return send(res, 400, { error: "Please write a short message." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  if (tooMany(ip)) return send(res, 429, { error: "Too many messages. Please try again in a few minutes." });

  const apiKey = process.env.RESEND_API_KEY;
  const to = String(process.env.CONTACT_TO_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || !to.length) {
    console.error("Contact form: RESEND_API_KEY or CONTACT_TO_EMAIL is not set");
    return send(res, 503, { error: "The contact form isn't set up yet." });
  }

  const from = process.env.CONTACT_FROM_EMAIL || "Riverside CC Website <onboarding@resend.dev>";
  const subject = `Website: ${TOPICS[topic]} from ${name}`.replace(/[\r\n]+/g, " ");
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Topic: ${TOPICS[topic]}`,
    "",
    message,
    "",
    "— Sent from the contact form on the Riverside Cricket Club website. Reply to this email to answer.",
  ].filter((l) => l !== null).join("\n");
  const html = `
    <table style="font-family:Arial,sans-serif;font-size:14px;color:#0b2545" cellpadding="4">
      <tr><td><b>Name</b></td><td>${esc(name)}</td></tr>
      <tr><td><b>Email</b></td><td>${esc(email)}</td></tr>
      ${phone ? `<tr><td><b>Phone</b></td><td>${esc(phone)}</td></tr>` : ""}
      <tr><td><b>Topic</b></td><td>${esc(TOPICS[topic])}</td></tr>
    </table>
    <p style="font-family:Arial,sans-serif;font-size:15px;color:#0b2545;white-space:pre-wrap">${esc(message)}</p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#5b6b80">Sent from the contact form on the Riverside Cricket Club website. Reply to this email to answer.</p>`;

  try {
    const r = await fetch(process.env.RESEND_BASE || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: email, subject, text, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error("Contact form: Resend error", r.status, await r.text().catch(() => ""));
      return send(res, 502, { error: "Sorry, your message couldn't be sent right now." });
    }
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error("Contact form:", err.message);
    return send(res, 502, { error: "Sorry, your message couldn't be sent right now." });
  }
}
