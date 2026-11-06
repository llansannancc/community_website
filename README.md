# Llansannan Community website

The community website for Llansannan, Bylchau and Bro Aled: what's on, village news, local services and history, in Welsh and English.

Anyone can **submit an event**. Volunteer **moderators** approve it before it appears. Everything is hosted on Cloudflare, with the database kept in the EU.

To set it up for the first time, see **[SETUP.md](SETUP.md)**.

## How moderation works

| | Public | Moderator | Lead moderator |
|---|:-:|:-:|:-:|
| Submit an event | ✓ | ✓ | ✓ |
| Approve or reject items waiting for approval | | ✓ | ✓ |
| Add events and news | | ✓ (needs a second approval) | ✓ (goes live straight away) |
| Edit items | | ✓ (a live item comes off the site until someone else re-approves it) | ✓ |
| Take down live items, restore rejected ones, delete | | | ✓ |
| Appoint and remove moderators | | | ✓ |
| Read the activity log | | | ✓ |

- **Second approval:** a moderator can never approve something they added or changed themselves. A different moderator or a lead has to approve it.
- **Activity log:** every action is recorded: who did it, what they did, when, and what changed. The database itself blocks the log from being edited or deleted.
- **Emails:** all moderators are emailed when something new needs approving.
- **Privacy:** submitters' contact details are only visible to moderators. They're deleted automatically 30 days after the event, and the log records each clean-up.
- **At least one lead:** the site won't let the last lead moderator be removed or demoted.

Moderators sign in at **/admin** with **Sign in with GitHub**. The site checks the verified email addresses on their GitHub account against the moderator list. There are no passwords or codes to manage.

## Where things are

| File | What it is |
|---|---|
| `public/index.html` | The website: layout, text and styles |
| `public/js/site.js` | Loads events, news and regular activities and draws the pages |
| `public/admin/` | The moderator area |
| `src/index.js` | The server: every rule above lives here |
| `src/auth.js` | Sign in with GitHub, and sessions |
| `src/email.js` | Notification emails |
| `migrations/` | Database tables (the site also creates any missing newer tables by itself) |
| `wrangler.jsonc` | Cloudflare settings |

## Common changes

- **Text on the pages** (history, local services, the hall and so on): edit `public/index.html`. Each piece of text has an English and a Welsh version side by side: `<span class="en">…</span><span class="cy">…</span>`.
- **Photos on news stories and events:** in the news or event form, click **Choose a photo**. People submitting events can attach one too; it only appears once the event is approved, and hidden location details are removed. Unused photos are cleared out daily. It's shrunk automatically and stored in the database (no R2 or card needed). Add a short description for people using screen readers.
- **Events, news and regular activities** (weekly classes, monthly coffee mornings): don't edit files. Use the moderator area: **Events**, **News** and **Regular**. They all follow the same approval rules.

Push the changes to GitHub. If automatic builds are connected, the site updates within a minute; otherwise run `npm run deploy`.

## Testing on your own computer

```bash
npm install
npm run db:local   # creates a local test database with sample data
npm run dev        # open http://localhost:8787
```

To act as someone from the sample data, open `http://localhost:8787/admin/?as=lead1@example.com`, or `?as=mod1@example.com` for a regular moderator. That shortcut only works on your computer, never on the live site. To try the real GitHub flow locally, run `node tests/mock-github.mjs` (a pretend GitHub) alongside `npm run dev`.

## Cost

Everything runs on Cloudflare's free plans: Workers, D1 database, Turnstile, and email to verified addresses. The only cost is the domain name.
