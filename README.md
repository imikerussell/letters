# Letters

The code from the Creator Magic video **[Claude Code Built My Newsletter: No More $169 Kit](https://youtu.be/0iZ8k6E5zUI)**.

It needs a Brevo account for the sending. The video is sponsored by Brevo, and code `CREATORMAGIC50` gets you 50% off the Starter and Standard plans for your first 3 months: https://mrc.fm/brevo

A tiny self-hosted newsletter. One Cloudflare Worker (plain JS, no framework, no database) with [Brevo](https://www.brevo.com) as the whole backend: contacts, the list, double opt-in, campaigns, unsubscribes and stats all live in Brevo and are reached through its REST API.

- `/`: a signup page (name and email). Brevo sends a confirmation email, and the person is added to the list only after they click it.
- `/archive`: every issue you have sent, newest first. `/archive/<id>` is the web version of an issue, exactly as subscribers got it, with a subscribe box at the bottom and no unsubscribe link. It all comes from Brevo's campaigns API, and only campaigns sent to the Letters list are shown.
- `/welcome`: where the confirmation link lands. It sends the welcome email once.
- `/admin` (password protected): write an issue in Markdown, preview it, send it to the list as a Brevo campaign, and see past issues with delivered, opens, clicks and unsubscribes. Brevo handles the unsubscribe link.

**Cost:** just your Brevo plan. The Worker fits easily in Cloudflare's free tier.

## Files

```
src/worker.js      routes and pages
src/guard.js       demo-mode allowlist
src/webversion.js  turns a sent campaign into its web version
src/markdown.js    a very small Markdown renderer
src/brevo.js       the Brevo API helper
scripts/setup.mjs  one-time Brevo setup
scripts/import-kit.mjs  move subscribers over from a Kit export
test/              node --test
```

## Setup in 5 steps

1. **Get the code and tools:** `git clone https://github.com/imikerussell/letters.git && cd letters && npm install`.
2. **Add secrets:** `cp .dev.vars.example .dev.vars`, then fill in your Brevo API key (Brevo → SMTP & API → API keys) and an admin password.
3. **Set up Brevo:** in Brevo, verify your sender domain. Change the sender (`hello@letters.example.com`) in `wrangler.toml` and `scripts/setup.mjs` to an address on your domain, and change the `routes` line in `wrangler.toml` to your own hostname (or delete it to use the free `workers.dev` address). Then run `npm run setup`. It creates the "Letters" list, the double opt-in template (tag `optin`), the welcome template and a `WELCOMED` contact attribute. It prints three ids for you to paste into `[vars]` in `wrangler.toml`. You can safely run it again.
4. **Try it locally:** `npm run dev`, then open http://localhost:8787. Admin is at `/admin`; any username works with your password. Run the tests with `npm test`.
5. **Deploy:** `npx wrangler secret put BREVO_API_KEY`, `npx wrangler secret put ADMIN_PASSWORD`, then `npm run deploy`.

## Moving from Kit

In Kit, export your subscribers (Subscribers → select all → Export) and save the CSV in this folder. Then run:

```
node scripts/import-kit.mjs kit_export.csv --dry-run   # shows what would happen
node scripts/import-kit.mjs kit_export.csv
```

The script adds only **active** subscribers to the Letters list, with their first names. Cancelled, bounced and other states are skipped. It uses Brevo's contact import, so people who already confirmed with Kit don't get another confirmation email. Demo mode applies: anyone outside `ALLOWED_EMAILS` is refused and listed. The script prints the list count before and after. `*.csv` is gitignored, so your export stays out of the repo.

## Demo mode (on by default)

`ALLOWED_EMAILS` in `wrangler.toml` is a comma-separated list of patterns, where `*` is a wildcard (for example `you+*@gmail.com`). While demo mode is on:

- signup refuses any address outside the list with a friendly "demo mode" message,
- `/welcome` won't email anyone outside it,
- the Kit import refuses anyone outside it,
- a send is refused if **any** contact on the Brevo list falls outside it.

If `ALLOWED_EMAILS` is empty, nothing is allowed.

**To turn demo mode off**, set `ALLOWED_EMAILS = "*"` and deploy again.

## Licence

MIT. See [LICENSE](LICENSE). This is a small demo, not a product: read the code before you point it at a real list.
