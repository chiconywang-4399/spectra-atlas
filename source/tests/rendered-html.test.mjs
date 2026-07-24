import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLocalSecureServer } from "../scripts/local-secure-server.mjs";

async function render(pathname = "/", headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://spectra-atlas.example${pathname}`, {
      headers: { accept: "text/html", host: "spectra-atlas.example", ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("anonymous visitors see a sign-in page without spectral data", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Spectra Atlas/);
  assert.match(html, /材料表征数据中枢/);
  assert.match(html, /使用 ChatGPT 账号登录/);
  assert.match(html, /\/signin-with-chatgpt/);
  assert.doesNotMatch(html, /交互式光谱工作台/);
  assert.doesNotMatch(html, /hBN58/);
  assert.match(html, /og\.png/);
});

test("authorized users can render the complete dashboard", async () => {
  const response = await render("/dashboard", {
    "oai-authenticated-user-email": "chiconywang@gmail.com",
    "oai-authenticated-user-full-name": encodeURIComponent("Chicony Wang"),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Raman/);
  assert.match(html, /UV–VIS/);
  assert.match(html, /FTIR/);
  assert.match(html, /XPS/);
  assert.match(html, /交互式光谱工作台/);
  assert.match(html, /chiconywang@gmail\.com/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("signed-in users outside the allowlist see an authorization page", async () => {
  const response = await render("/dashboard", {
    "oai-authenticated-user-email": "someone@example.com",
  });
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /该账号尚未获得数据访问权限/);
  assert.match(html, /someone@example\.com/);
  assert.doesNotMatch(html, /交互式光谱工作台/);
});

test("generated data contains all four requested techniques", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../app/spectral-data.json", import.meta.url), "utf8"),
  );

  assert.ok(payload.raman.series.length >= 4);
  assert.ok(payload.uvvis.series.length >= 3);
  assert.ok(payload.ftir.series.length >= 2);
  assert.ok(payload.xps.regions.length >= 4);
  assert.ok(payload.totals.files >= 1000);
});

test("local secure entry requires a password and serves the authorized dashboard", async (t) => {
  const server = createLocalSecureServer({
    password: "test-password-123",
    sessionToken: "test-session-token",
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  t.after(
    () =>
      new Promise((resolvePromise) => {
        server.close(resolvePromise);
      }),
  );

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const anonymousDashboard = await fetch(`${origin}/dashboard`, {
    redirect: "manual",
  });
  assert.equal(anonymousDashboard.status, 303);
  assert.match(
    anonymousDashboard.headers.get("location") ?? "",
    /^\/signin-with-chatgpt/,
  );

  const signInPage = await fetch(
    `${origin}/signin-with-chatgpt?return_to=%2Fdashboard`,
  );
  assert.equal(signInPage.status, 200);
  assert.match(await signInPage.text(), /输入本机访问密码/);

  const rejectedSignIn = await fetch(`${origin}/local-login`, {
    body: new URLSearchParams({
      password: "incorrect",
      return_to: "/dashboard",
    }),
    method: "POST",
    redirect: "manual",
  });
  assert.equal(rejectedSignIn.status, 401);

  const acceptedSignIn = await fetch(`${origin}/local-login`, {
    body: new URLSearchParams({
      password: "test-password-123",
      return_to: "/dashboard",
    }),
    method: "POST",
    redirect: "manual",
  });
  assert.equal(acceptedSignIn.status, 303);
  assert.equal(acceptedSignIn.headers.get("location"), "/dashboard");
  const cookie = acceptedSignIn.headers.get("set-cookie");
  assert.match(cookie ?? "", /spectra_local_session=test-session-token/);
  assert.match(cookie ?? "", /HttpOnly/);
  assert.match(cookie ?? "", /SameSite=Strict/);

  const dashboard = await fetch(`${origin}/dashboard`, {
    headers: { cookie },
  });
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /交互式光谱工作台/);
  assert.match(dashboardHtml, /chiconywang@gmail\.com/);
  for (const technique of ["Raman", "UV–VIS", "FTIR", "XPS"]) {
    assert.match(dashboardHtml, new RegExp(technique));
  }
});
