# Riverside Cricket Club website (Vercel)

Live fixtures, results and ladders from PlayHQ, a PlayHQ-style fixture filter, and the club's
latest Instagram posts. Ready to deploy on Vercel's free plan.

```
public/            the website
  index.html         home page (riversidebluescc.com/)
  about-us.html      About our club (/about-us)
  contact.html       Contact us with a form (/contact)
  styles.css, script.js (home page), site.js (About and Contact), logo, partner logos
api/               Vercel functions the website calls
  club-data.js       next match, latest results, upcoming fixtures, ladders
  filters.js         association → competition → season options
  season-teams.js    Riverside's teams in a season
  team-games.js      one team's full fixture and results
  instagram.js       latest Instagram posts
  health.js          setup check
  contact.js         sends contact-form messages to the club by email
  cron/refresh-instagram.js   weekly job that keeps the Instagram token alive
lib/playhq.js      all PlayHQ and Instagram logic
vercel.json        Vercel settings (static folder, function time limit, weekly cron)
dev-server.js      local preview only (not used on Vercel)
```

## Deploy to Vercel (about 10 minutes)

### Option A: through GitHub (recommended)
1. Create a free account at **github.com**, then a new **private** repository, e.g. `riverside-website`.
2. Upload everything in this folder **except `.env`** (it holds your keys; `.gitignore` already skips it
   if you use Git).
3. Go to **vercel.com**, sign in with GitHub, click **Add New → Project**, and import the repository.
4. Leave the build settings alone. `vercel.json` sets everything: framework **Other**, no install or
   build step, website served from `public/`.
5. Before clicking Deploy, open **Environment Variables** and add these (values are in your `.env`):

   | Name | Value |
   |---|---|
   | `PLAYHQ_API_KEY` | your PlayHQ key |
   | `PLAYHQ_TENANT` | `ca` |
   | `PLAYHQ_ORG_ID` | `d0eb0714-4316-4e70-840d-a99265efd932` |
   | `TIMEZONE` | `Australia/Hobart` |
   | `INSTAGRAM_ACCESS_TOKEN` | your Instagram token (add later if you don't have it yet) |
   | `CRON_SECRET` | any long random text, e.g. from a password generator |
   | `RESEND_API_KEY` | for the contact form (see "Contact form" below) |
   | `CONTACT_TO_EMAIL` | the club email address that should receive messages |

6. Click **Deploy**. You get a link like `riverside-website.vercel.app`.

Every later change you push to GitHub redeploys automatically.

### Option B: from your computer
1. Install Node.js 20 or newer from nodejs.org.
2. In a terminal in this folder: `npx vercel` and follow the prompts (log in, accept the defaults).
3. Add the environment variables from the table above in the Vercel dashboard
   (Project → Settings → Environment Variables), then run `npx vercel --prod`.

### After deploying, check it
Open `https://YOUR-SITE.vercel.app/api/health`. You should see `"ok": true`, the seasons and
grades it found, and `"instagram": "token set"` once that's added.

**Changed an environment variable?** Redeploy (Deployments → ⋯ → Redeploy) so it takes effect.

## Use your own domain (riversidebluescc.com)
In Vercel: Project → Settings → **Domains** → add `riversidebluescc.com` and `www.riversidebluescc.com`.
Vercel shows the DNS records to set. Change them wherever the domain is managed (currently Wix:
Domains → Manage DNS records). Once they're switched, the domain shows the new site instead of the Wix one.
Keep the Wix site until you're happy with the new one.

## Contact form (about 5 minutes, once)
The form on /contact emails messages to the club through **Resend** (free for up to 3,000 emails a month).

1. Sign up at **resend.com** using the email address that should receive messages.
2. Go to **API Keys → Create API key** and copy it (it starts with `re_`).
3. In Vercel, add `RESEND_API_KEY` (the key) and `CONTACT_TO_EMAIL` (that same email address), then redeploy.

Messages arrive from "Riverside CC Website", with the sender's email set as the reply-to, so you can
just press Reply. Until this is set up, the form tells visitors to message the club on Facebook or Instagram.

To send to other addresses (for example a second committee member), verify your domain in Resend
(Domains → Add domain), then set `CONTACT_FROM_EMAIL` to e.g. `Riverside CC Website <website@riversidebluescc.com>`
and list several addresses in `CONTACT_TO_EMAIL`, separated by commas.

The form has built-in spam protection (a hidden trap field and a limit of 5 messages per person per 10 minutes).

## Pages and old links
`/about-us` and `/contact` use the same addresses as the old Wix site, so existing links keep working.
`/documents` (the old policies page) redirects to the home page.
To change the About page wording, edit `public/about-us.html`.

## Instagram: temporary backup using the old Wix app
Until you have an official token, the site can read posts from the Wix Instagram Feed app's server,
using the values from your old Wix site. Add these in Vercel (the values are in your Postman request):

| Name | Postman header it comes from |
|---|---|
| `WIX_INSTAGRAM_TOKEN` | `x-instagram-token` |
| `WIX_INSTAGRAM_USER_ID` | `x-instagram-user-id` (17841400982995082) |
| `WIX_COMP_ID` | `x-wix-comp-id` (comp-m46st6zl2) |
| `WIX_INSTANCE_ID` | `x-wix-instance-id` |

This is temporary: the Wix session value can expire, and everything stops when the Wix site is closed
or the app removed. When it fails, the Instagram section shows the profile tiles and the Vercel logs say
"Wix Instagram backup failed". `/api/health` shows which source is in use.
As soon as `INSTAGRAM_ACCESS_TOKEN` is set, the site uses that instead and ignores the Wix values.

## Instagram token (about 10 minutes, once)
@riversidebluescc is a business account, so this works with Instagram's official API.
(Meta renames menus from time to time, so the wording may differ slightly.)

1. Go to **developers.facebook.com** → **My Apps → Create app**, choose the Instagram option,
   and name it e.g. "Riverside website".
2. Open **Instagram → API setup with Instagram login**.
3. Under **Generate access tokens**, click **Add account** and log in as **@riversidebluescc**.
4. Click **Generate token** and copy it. It starts with `IGAA`.
5. Add it in Vercel as `INSTAGRAM_ACCESS_TOKEN`, then redeploy.

The token lasts 60 days. The weekly cron job in `vercel.json` refreshes it so it doesn't expire.
If posts ever stop showing, generate a new token and update the variable.
(The Wix values above only work through the Wix app's server, never directly with Instagram.)

## How it stays fast
Vercel's CDN caches each answer (fixtures 5 minutes, season lists 1 hour, Instagram 15 minutes)
and keeps showing the last good copy while it fetches a fresh one. If PlayHQ is briefly down,
the site still shows the most recent data.

## Run it on your computer first (optional)
```
npm run dev
```
(`npm start` was renamed to `npm run dev`.) Then open http://localhost:3000. It reads your keys from `.env`. No `npm install` needed.

## Settings
| Variable | What it does |
|---|---|
| `PLAYHQ_API_KEY` | Required. Your PlayHQ key. |
| `PLAYHQ_ORG_ID` | Riverside's PlayHQ organisation. Seasons and grades are found from this automatically. |
| `PLAYHQ_SEASON_IDS` | Optional. Only use these seasons (comma-separated). |
| `PLAYHQ_GRADE_IDS` | Optional. Extra grades to always include. |
| `CLUB_NAME` | Text used as a fallback to spot Riverside teams (default `Riverside`). |
| `CACHE_SECONDS` | How long fixtures are cached (default 300). |
| `INSTAGRAM_ACCESS_TOKEN` | Optional. Shows the latest posts. |
| `INSTAGRAM_POSTS` | How many posts to show (default 6). |
| `CRON_SECRET` | Recommended. Stops anyone else triggering the token refresh. |
| `RESEND_API_KEY` | Contact form: Resend API key. |
| `CONTACT_TO_EMAIL` | Contact form: where messages go (comma-separated for several). |
| `CONTACT_FROM_EMAIL` | Optional. Sender address, once your domain is verified in Resend. |

New season? Nothing to change. The site picks up seasons marked active in PlayHQ.

## Footer logos and icons
- `public/partners/playhq.png` and `public/partners/cricket-australia.png` are the partner logos.
  Swap them for updated files with the same names.
- The Facebook and Instagram icons come from Simple Icons (CC0). Link addresses are in `public/index.html`
  in the footer. The "Policies" link is a placeholder (`href="#"`): point it at your policies page or PDF.
