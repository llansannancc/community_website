# Setting up the Llansannan Community website

The site runs on the **council's Cloudflare account**, as a separate project from the council website. It goes live in two stages:

- **Stage 1: now.** The site runs on a free temporary address (`…workers.dev`) and is **private**: only people you list can open it. Councillors and moderators can try everything with real events before the public sees it.
- **Stage 2: when the domain is confirmed.** Move it to the domain, open it to the public, and switch on email notifications and the spam check.

You need: access to the **council's Cloudflare account**, the **Llansannan GitHub account**, and **Node.js 20 or newer** on your computer.

---

# Stage 1: private test site

## 1. Put the code on GitHub

Create a new **private** repository on the Llansannan GitHub account, for example `community-website`, with no README. Then, in this folder:

```bash
git init
git add .
git commit -m "Llansannan Community website"
git branch -M main
git remote add origin https://github.com/<llansannan-account>/community-website.git
git push -u origin main
```

## 2. Install and sign in to the council's Cloudflare account

```bash
npm install
npx wrangler login
```

A browser window opens. Sign in to the **council's** Cloudflare account and click **Allow**.

## 3. Create the database (kept in the EU)

```bash
npx wrangler d1 create llansannan --jurisdiction eu
```

Copy the `database_id` it prints into `wrangler.jsonc`, replacing `CHANGE_ME` in the top `d1_databases` section. Don't leave out `--jurisdiction eu`: it can't be added later.

Then create the tables:

```bash
npm run db:remote
```

## 4. Add the two lead moderators

Replace the names and emails, then run:

```bash
npx wrangler d1 execute llansannan --remote --command "INSERT INTO moderators (email, name, role) VALUES ('first.lead@example.com', 'First Lead', 'lead'), ('second.lead@example.com', 'Second Lead', 'lead')"
```

From then on, the leads appoint everyone else from the **Moderators** screen on the site.

## 5. Publish

```bash
npm run deploy
```

It prints the site's address, something like `https://llansannan-community.<name>.workers.dev`. Put that address into `wrangler.jsonc` as `SITE_URL`.

## 6. Make it private (Cloudflare Access)

1. Cloudflare dashboard → **Workers & Pages** → `llansannan-community` → **Settings** → **Domains & Routes**.
2. Next to **workers.dev**, click **Enable Cloudflare Access**. If you're asked to set up Zero Trust first, pick a team name (for example `llansannan`) and the **Free** plan.
3. The box that appears shows two values. Copy them into `wrangler.jsonc`:
   - the **AUD tag** → `ACCESS_AUD`
   - the **team domain** → `ACCESS_TEAM_DOMAIN`
4. Click **Manage Cloudflare Access** and add the email address of everyone who should be able to see the test site: the leads, the moderators and any councillors who want a look.
5. Publish again so the site picks up the new settings:

   ```bash
   npm run deploy
   ```

People on that list sign in with a code emailed to them. Being able to *see* the test site doesn't make someone a moderator: the **Moderators** screen still decides who can approve things.

## 7. Try it out

- [ ] Open the site address and sign in with the emailed code. The homepage loads.
- [ ] Submit a test event from **Submit an event**.
- [ ] Go to `/admin`, approve it, and check it appears on the homepage.
- [ ] A lead appoints a moderator. The moderator signs in and has no **Moderators** or **Activity log** tabs.
- [ ] The moderator adds an event. It waits for a *different* moderator to approve it.
- [ ] Everything you did appears in the **Activity log**.

Email notifications and the spam check are switched off in this stage, because both need the domain.

### Optional: publish automatically from GitHub

Cloudflare dashboard → **Workers & Pages** → `llansannan-community` → **Settings → Builds** → connect the GitHub repository, with the deploy command `npx wrangler deploy`. After that, every change pushed to GitHub goes live within a minute.

---

# Stage 2: going public on the domain

## 1. Register the domain

In the council's Cloudflare account: **Domain Registration → Register Domains**. Registering it here also sets up its DNS.

## 2. Point the site at it

In `wrangler.jsonc`:

- set `"workers_dev": false`
- remove the `//` from the `routes` lines, and put the domain in `pattern`
- set `SITE_URL` to `https://<the-domain>`
- set `MAIL_FROM` to `notifications@<the-domain>`

## 3. Protect only the moderator area

The public needs to see the site now, so Access should guard only the moderator pages.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
   - Name: `Llansannan moderators`
   - Destinations: path `admin` and path `api/admin` on the domain
   - Session duration: 1 week
2. Policy: **Allow**, Include **Everyone**. The site itself refuses anyone who isn't on its moderator list, so the leads never need to touch Cloudflare to appoint people.
3. Add this application's **AUD tag** to `ACCESS_AUD`, after a comma: `"old-tag, new-tag"`. Once everything works on the domain, you can remove the old one.

The free plan allows up to 50 people to sign in. You can remove anyone who's no longer involved under **Zero Trust → My Team → Users**.

## 4. Spam check (Turnstile)

1. Dashboard → **Turnstile → Add widget**. Add the domain and choose **Managed**.
2. Put the **Site key** in `wrangler.jsonc` as `TURNSTILE_SITE_KEY`.
3. Save the secret key:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

## 5. Email notifications

1. Domain → **Email → Email Routing**: turn it on.
2. **Email Sending**: onboard the domain.
3. **Email Routing → Destination addresses**: add each moderator's email. They each click a link once. On the free plan, Cloudflare only delivers to verified addresses, so do this for every new moderator.
4. In `wrangler.jsonc`, remove the `//` from the three `send_email` lines.

## 6. Publish

```bash
npm run deploy
```

Then check that a submitted event triggers an email, and that the public can see the site without signing in, but `/admin` asks for a code.

## Before going public, fill in

- The Facebook group link: search the files for `facebook.com/groups/`.
- The clerk's email in the privacy notice: search for `[clerk email address]`.
- Phone numbers, emails, hall prices and opening hours marked `[ ]`.
- Weekly activities: the list at the top of `public/js/site.js`.
