# Setting up the Llansannan Community website

The site runs on the **council's Cloudflare account**, as a separate project from the council website. Everything here is done in the browser, with no card details needed. Moderators sign in with their GitHub accounts.

- **Stage 1: now.** The site runs on its free address, `https://llansannan-community.llansannancc.workers.dev`. Search engines are told not to list it, so councillors can test it quietly.
- **Stage 2: when the domain is confirmed.** Move it to the domain, and switch on email notifications and the spam check.

---

# Stage 1

## 1. Database ✅ (done)

The D1 database `llansannan` has been created in the EU, and its ID is in `wrangler.jsonc`.

## 2. Connect the GitHub repo ✅ (done)

**Workers & Pages → Create → Import a repository → llansannancc/community_website**, with:

- Project name: `llansannan-community`
- Deploy command: `npx wrangler d1 migrations apply llansannan --remote && npx wrangler deploy`

Every push to GitHub now updates the site, and any new database changes are applied automatically.

If a build ever fails with a **permissions error** on the first command, run each file in the `migrations` folder by hand in **D1 → llansannan → Console**, in order, and change the deploy command to `npx wrangler deploy`.

## 3. Create the GitHub sign-in app

Moderators sign in with their GitHub account. GitHub needs to know about the website first.

1. Sign in to GitHub as the account or organisation that should own the sign-in, for example **llansannancc**.
   - For a personal account: **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - For an organisation: **the organisation's Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name:** `Llansannan Community moderators`
   - **Homepage URL:** `https://llansannan-community.llansannancc.workers.dev`
   - **Authorization callback URL:** `https://llansannan-community.llansannancc.workers.dev/api/auth/github/callback`
3. Click **Register application**.
4. Copy the **Client ID** into `wrangler.jsonc` as `GITHUB_CLIENT_ID`, and commit. It isn't secret.
5. Click **Generate a new client secret** and copy it. GitHub only shows it once.
6. In Cloudflare: **Workers & Pages → llansannan-community → Settings → Variables and Secrets → Add**. Choose type **Secret**, name it `GITHUB_CLIENT_SECRET`, paste the secret as the value, and click **Deploy**.

## 4. Add the first lead moderator

**Storage & databases → D1 → llansannan → Console**, then run, using the email address on your GitHub account:

```sql
INSERT INTO moderators (email, name, role) VALUES ('your@email', 'Your Name', 'lead');
```

Then go to `https://llansannan-community.llansannancc.workers.dev/admin/` and click **Sign in with GitHub**.

## 5. Appoint the other moderators

**Moderators → Appoint a moderator**, using **the email address on their GitHub account**. Tell them to go to `/admin/` and click **Sign in with GitHub**. Anyone without a GitHub account can create one for free while signing in.

- They stay signed in on that device for 30 days, then click the button again.
- Removing someone from the list signs them out everywhere straight away.
- Appoint the second lead with the role **Lead moderator**.
- Every sign-in, including refused attempts by people not on the list, is recorded in the **Activity log**.

## 6. Nothing else to manage

There are no passwords or codes to look after. If someone loses their phone, they sign in again with GitHub on the new one.

## 7. Try it out

- [ ] Submit a test event from **Submit an event** on the homepage.
- [ ] Approve it in `/admin`, and check it appears on the homepage.
- [ ] Appoint a test moderator and open their link in a private browser window. They have no **Moderators** or **Activity log** tabs.
- [ ] The test moderator adds an event. It waits for a *different* moderator to approve it.
- [ ] Everything you did appears in the **Activity log**.

---

# Stage 2: going public on the domain

## 1. Register the domain

In the council's Cloudflare account: **Domain Registration → Register Domains**.

## 2. Point the site at it

In the GitHub OAuth app (step 3 of Stage 1), change the **Homepage URL** and **Authorization callback URL** to the domain: `https://<the-domain>/api/auth/github/callback`.

Then

Edit `wrangler.jsonc` on GitHub:

- set `"workers_dev": false`
- remove the `//` from the `routes` lines and put the domain in `pattern`
- set `SITE_URL` to `https://<the-domain>`
- set `MAIL_FROM` to `notifications@<the-domain>`

Moderators sign in again once on the new address with **Sign in with GitHub**.

## 3. Spam check (Turnstile)

1. **Turnstile → Add widget**. Add the domain and choose **Managed**.
2. Put the **Site key** in `wrangler.jsonc` as `TURNSTILE_SITE_KEY`.
3. Add the **Secret key** as a secret named `TURNSTILE_SECRET` (Settings → Variables and Secrets).

## 4. Email notifications

1. Domain → **Email → Email Routing**: turn it on.
2. **Email Sending**: onboard the domain.
3. **Email Routing → Destination addresses**: add each moderator's email. They each click a link once. On the free plan, Cloudflare only delivers to verified addresses.
4. In `wrangler.jsonc`, remove the `//` from the three `send_email` lines.

## Before going public, fill in

- The Facebook group link: search the files for `facebook.com/groups/`.
- The clerk's email in the privacy notice: search for `[clerk email address]`.
- Phone numbers, emails, hall prices and opening hours marked `[ ]`.
