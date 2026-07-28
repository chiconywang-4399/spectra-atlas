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

test("UV-VIS transmittance data and axis are constrained to 0-100 percent", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../app/spectral-data.json", import.meta.url), "utf8"),
  );
  const source = await readFile(new URL("../app/SpectralDashboard.tsx", import.meta.url), "utf8");
  const uvvisValues = payload.uvvis.series.flatMap((series) =>
    series.points.map((point) => point[1]),
  );

  assert.ok(uvvisValues.length > 0);
  assert.ok(Math.min(...uvvisValues) >= 0);
  assert.ok(Math.max(...uvvisValues) <= 100);
  assert.match(
    source,
    /yDomain=\{technique === "ftir" \|\| technique === "uvvis" \? \[0, 100\] : undefined\}/,
  );
});

test("paper plot exports use square frames and publication-scale strokes", async () => {
  const source = await readFile(new URL("../app/SpectralDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /label: "Paper single column 89 mm"/);
  assert.match(source, /label: "Paper double column 183 mm"/);
  assert.match(source, /axisPt: 0\.6/);
  assert.match(source, /measuredPt: 0\.75/);
  assert.match(source, /fitPt: 0\.9/);
  assert.match(source, /componentPt: 0\.7/);
  assert.match(source, /rx="0"[\s\S]*?ry="0"[\s\S]*?className="plot-surface"/);
  assert.match(source, /rect\.setAttribute\("rx", "0"\)/);
  assert.match(source, /rect\.setAttribute\("ry", "0"\)/);
  assert.match(source, /<g clipPath=\{`url\(#\$\{clipIdRef\.current\}\)`\}>/);
});

test("plot legends and exported series labels are normalized to English", async () => {
  const source = await readFile(new URL("../app/SpectralDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /function englishSeriesLabel/);
  assert.match(source, /\.replaceAll\(" · ", " - "\)/);
  assert.match(source, /\.replace\("无 RTP", "no RTP"\)/);
  assert.ok(source.includes('.replace(/(\\d+)\\s*次均值/g, "$1-run mean")'));
});

test("CSV and TXT exports use Origin-friendly wide XY columns", async () => {
  const source = await readFile(new URL("../app/SpectralDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /function originWideRows/);
  assert.match(source, /const designations = prepared\.flatMap\(\(\) => \["X", "Y"\]\)/);
  assert.match(source, /axisParts\(xLabel\)/);
  assert.match(source, /axisParts\(yLabel\)/);
  assert.match(source, />\s*Origin CSV\s*<\/button>/);
  assert.match(source, />\s*Origin TXT\s*<\/button>/);
  assert.match(source, /units\?: string\[\]/);
  assert.match(source, /comments\?: string\[\]/);
  assert.doesNotMatch(source, /const headers = \["series_id"/);
});

test("XPS export includes deconvolution, background-corrected, residual, and fit metadata", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../app/spectral-data.json", import.meta.url), "utf8"),
  );
  const source = await readFile(new URL("../app/SpectralDashboard.tsx", import.meta.url), "utf8");

  for (const region of payload.xps.regions) {
    const ids = new Set(region.series.map((series) => series.id));
    assert.ok(ids.has("measured"), `${region.label} is missing measured XPS data`);
    assert.ok(ids.has("fit"), `${region.label} is missing total-fit XPS data`);
    assert.ok(ids.has("background"), `${region.label} is missing Shirley background data`);
    assert.ok(
      region.series.some((series) => !["measured", "fit", "background"].includes(series.id)),
      `${region.label} is missing fitted component/deconvoluted curves`,
    );
    assert.ok(
      payload.xps.fitResults.some((row) => row.region === region.label),
      `${region.label} is missing fit parameter rows`,
    );
    assert.ok(
      payload.xps.fitQuality.some((row) => row.region === region.label),
      `${region.label} is missing fit-quality rows`,
    );
  }

  assert.match(payload.xps.chargeReference.line, /C 1s/);
  assert.equal(typeof payload.xps.chargeReference.target_binding_energy_eV, "number");
  assert.equal(typeof payload.xps.chargeReference.applied_shift_eV, "number");
  assert.match(source, /buildXpsExportSeries/);
  assert.match(source, /background_subtracted/);
  assert.match(source, /Residual: measured - total fit/);
  assert.match(source, /xps_export_inventory/);
  assert.match(source, /xps_fit_parameters/);
  assert.match(source, /xps_fit_quality/);
  assert.match(source, /xps_charge_reference/);
});

test("Avantage XPS Excel import is local-only and keeps fitted peak data exportable", async () => {
  const source = await readFile(new URL("../app/SpectralDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /parseAdvantageXpsExcel/);
  assert.match(source, /parseXlsxWorkbook/);
  assert.match(source, /DecompressionStream/);
  assert.match(source, /Avantage XPS Excel/);
  assert.match(source, /accept="\.xlsx,\.xlsm,\.xls,\.xml,\.html,\.htm"/);
  assert.match(source, /Fitted\\s\+Peak/);
  assert.match(source, /fitted\\s\+envelope/);
  assert.match(source, /backgnd\|background\|shirley/);
  assert.match(source, /advantage_peak_table/);
  assert.match(source, /No GitHub token is required for local plotting/);
  assert.match(source, /Nothing is written to GitHub and no token is used/);
  assert.match(source, /buildXpsExportSeries\(advantageSeries\)/);
  assert.match(source, /exportSections=\{advantagePreview\.exportSections\}/);
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
