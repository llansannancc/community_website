// A pretend GitHub, used only by the automated tests. Run: node tests/mock-github.mjs
// The test picks which GitHub user signs in by starting at /login/oauth/authorize?...&as=<email>
import http from "node:http";
const codes = new Map(), tokens = new Map();
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8788");
  const send = (code, data) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/login/oauth/authorize") {
    const email = url.searchParams.get("as") || "lead1@example.com";
    const code = "code-" + Math.random().toString(36).slice(2);
    codes.set(code, email);
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", code); back.searchParams.set("state", url.searchParams.get("state"));
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    const { code, client_secret } = JSON.parse(body || "{}");
    if (client_secret !== "test-secret" || !codes.has(code)) return send(200, { error: "bad_verification_code" });
    const token = "tok-" + Math.random().toString(36).slice(2);
    tokens.set(token, codes.get(code)); codes.delete(code);
    return send(200, { access_token: token, token_type: "bearer" });
  }
  const email = tokens.get((req.headers.authorization || "").replace("Bearer ", ""));
  if (!email) return send(401, { message: "Bad credentials" });
  if (url.pathname === "/user") return send(200, { login: email.split("@")[0].replace(/\W/g, "") });
  if (url.pathname === "/user/emails") return send(200, email === "unverified@example.com"
    ? [{ email, verified: false, primary: true }]
    : [{ email: "personal-" + email, verified: true, primary: true }, { email: email.toUpperCase(), verified: true, primary: false }]);
  send(404, {});
}).listen(8788, "127.0.0.1", () => console.log("pretend GitHub on 8788"));
