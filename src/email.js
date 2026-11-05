// Email notifications to moderators.
// Uses Cloudflare's Email Sending binding (env.EMAIL). On the free Workers plan, Cloudflare will
// only deliver to addresses verified in Email Routing, so each moderator verifies their address once.
// If the binding isn't set up yet, the site still works; it just doesn't send emails.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function notifyModerators(env, { subject, lines, link, excludeId = null }) {
  if (!env.EMAIL || !env.MAIL_FROM) return { sent: 0, skipped: "email not configured" };
  const { results } = await env.DB.prepare(
    "SELECT id, email, name FROM moderators WHERE active = 1"
  ).all();
  const to = results.filter((m) => m.id !== excludeId);
  const url = `${env.SITE_URL || ""}${link}`;
  const text = `${lines.join("\n")}\n\nReview it here: ${url}\n\n— Llansannan Community website`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c2329">
    ${lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("")}
    <p style="margin:16px 0"><a href="${esc(url)}" style="background:#3466b0;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none">Open the moderator area</a></p>
    <p style="color:#666;font-size:13px">Llansannan Community website</p></div>`;

  let sent = 0;
  for (const m of to) {
    try {
      await env.EMAIL.send({
        to: m.email,
        from: { email: env.MAIL_FROM, name: "Llansannan Community" },
        subject, text, html,
      });
      sent++;
    } catch (e) {
      // Usually means this moderator hasn't verified their address yet. Don't block the submission.
      console.error("Email to moderator failed", m.email, e && (e.code || e.message));
    }
  }
  return { sent };
}
