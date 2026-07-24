import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLIENT_ROOT = resolve(PROJECT_ROOT, "dist", "client");
const SERVER_ENTRY = resolve(PROJECT_ROOT, "dist", "server", "index.js");
const COOKIE_NAME = "spectra_local_session";
const AUTHORIZED_EMAIL = "chiconywang@gmail.com";
const MAX_BODY_BYTES = 64 * 1024;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    const workerUrl = pathToFileURL(SERVER_ENTRY);
    workerUrl.searchParams.set("local", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then(({ default: worker }) => worker);
  }
  return workerPromise;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function safeReturnTo(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return "/dashboard";
    if (
      ["/signin-with-chatgpt", "/signout-with-chatgpt", "/local-login"].includes(
        url.pathname,
      )
    ) {
      return "/dashboard";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        if (separator < 0) return [entry, ""];
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );
}

function isAllowedHost(hostHeader = "") {
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loginHtml(returnTo, message = "") {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>本机登录｜Spectra Atlas</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh; margin: 0; display: grid; place-items: center; color: #edf3ff;
        background:
          radial-gradient(circle at 80% 18%, rgba(75, 145, 255, .22), transparent 30%),
          linear-gradient(145deg, #07101f, #0c1830 55%, #09111f);
      }
      main {
        width: min(92vw, 480px); padding: 38px; border: 1px solid rgba(148, 178, 225, .25);
        border-radius: 24px; background: rgba(9, 20, 39, .82); box-shadow: 0 28px 80px rgba(0,0,0,.38);
        backdrop-filter: blur(18px);
      }
      .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; }
      .mark {
        display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px;
        background: linear-gradient(135deg, #6ab8ff, #5472ff); color: white; font-weight: 800;
      }
      .brand strong, .brand span { display: block; }
      .brand span { margin-top: 3px; color: #91a5c5; font-size: 12px; }
      .eyebrow { color: #7f9dc8; font-size: 11px; letter-spacing: .16em; }
      h1 { margin: 12px 0; font-size: clamp(28px, 7vw, 42px); line-height: 1.12; }
      .intro { margin: 0 0 28px; color: #aebdd4; line-height: 1.7; }
      label { display: block; margin-bottom: 9px; color: #cdd8e9; font-size: 13px; }
      input {
        width: 100%; height: 50px; border: 1px solid #344966; border-radius: 12px;
        padding: 0 15px; background: #081427; color: white; font-size: 16px; outline: none;
      }
      input:focus { border-color: #69aaff; box-shadow: 0 0 0 3px rgba(87, 155, 255, .16); }
      button {
        width: 100%; height: 50px; margin-top: 14px; border: 0; border-radius: 12px;
        background: linear-gradient(100deg, #62b5ff, #596fff); color: white;
        font-size: 15px; font-weight: 750; cursor: pointer;
      }
      .message {
        margin: 0 0 16px; padding: 11px 13px; border-radius: 10px;
        background: rgba(255, 103, 103, .12); color: #ffb4b4; font-size: 13px;
      }
      footer { margin-top: 24px; color: #7389aa; font-size: 11px; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <div class="mark">SA</div>
        <div><strong>Spectra Atlas</strong><span>材料表征数据中枢</span></div>
      </div>
      <div class="eyebrow">LOCAL SECURE ACCESS</div>
      <h1>输入本机访问密码</h1>
      <p class="intro">验证后即可浏览 Raman、UV–VIS、FTIR 与 XPS 数据。</p>
      ${message ? `<p class="message">${htmlEscape(message)}</p>` : ""}
      <form action="/local-login" method="post">
        <input type="hidden" name="return_to" value="${htmlEscape(returnTo)}" />
        <label for="password">本次运行密码</label>
        <input id="password" name="password" type="password" required autofocus autocomplete="current-password" />
        <button type="submit">登录并进入数据工作台</button>
      </form>
      <footer>只允许本机访问。密码仅保存在当前运行进程中，关闭启动窗口后立即失效。</footer>
    </main>
  </body>
</html>`;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function serveStaticAsset(pathname, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  } catch {
    return false;
  }
  if (!decodedPath || decodedPath.endsWith("/") || decodedPath.includes("\0")) {
    return false;
  }

  const target = resolve(CLIENT_ROOT, decodedPath);
  if (target !== CLIENT_ROOT && !target.startsWith(`${CLIENT_ROOT}${sep}`)) {
    return false;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(html);
}

function redirect(response, location, cookie) {
  const headers = {
    "cache-control": "no-store",
    location,
  };
  if (cookie) headers["set-cookie"] = cookie;
  response.writeHead(303, headers);
  response.end();
}

async function forwardWorkerResponse(workerResponse, response, localCopy) {
  const headers = {};
  workerResponse.headers.forEach((value, name) => {
    if (!["content-encoding", "content-length"].includes(name.toLowerCase())) {
      headers[name] = value;
    }
  });
  headers["cache-control"] = "no-store";

  const contentType = workerResponse.headers.get("content-type") ?? "";
  if (contentType.startsWith("text/html")) {
    let html = await workerResponse.text();
    if (localCopy) {
      html = html
        .replace("使用 ChatGPT 账号登录", "使用本机访问密码登录")
        .replace(
          "登录由 ChatGPT 安全完成；网站不会接触或保存你的密码。",
          "密码仅在本次本机运行中使用，关闭启动窗口后立即失效。",
        );
    }
    response.writeHead(workerResponse.status, headers);
    response.end(html);
    return;
  }

  response.writeHead(workerResponse.status, headers);
  response.end(Buffer.from(await workerResponse.arrayBuffer()));
}

export function createLocalSecureServer({ password, sessionToken = randomBytes(32).toString("hex") }) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("本机访问密码至少需要 8 个字符。");
  }

  return createServer(async (request, response) => {
    try {
      if (!isAllowedHost(request.headers.host)) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("只允许从本机访问。");
        return;
      }

      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const returnTo = safeReturnTo(requestUrl.searchParams.get("return_to"));
      const cookies = parseCookies(request.headers.cookie);
      const isAuthenticated = constantTimeEqual(
        cookies[COOKIE_NAME] ?? "",
        sessionToken,
      );

      if (
        request.method === "GET" &&
        (requestUrl.pathname.startsWith("/assets/") ||
          [".css", ".ico", ".js", ".json", ".map", ".png", ".svg", ".webp", ".woff", ".woff2"].includes(
            extname(requestUrl.pathname).toLowerCase(),
          ))
      ) {
        if (await serveStaticAsset(requestUrl.pathname, response)) return;
      }

      if (requestUrl.pathname === "/signin-with-chatgpt") {
        sendHtml(response, 200, loginHtml(returnTo));
        return;
      }

      if (requestUrl.pathname === "/local-login" && request.method === "POST") {
        const form = new URLSearchParams(await readRequestBody(request));
        const destination = safeReturnTo(form.get("return_to"));
        if (!constantTimeEqual(form.get("password") ?? "", password)) {
          sendHtml(response, 401, loginHtml(destination, "密码不正确，请重新输入。"));
          return;
        }

        redirect(
          response,
          destination,
          `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`,
        );
        return;
      }

      if (requestUrl.pathname === "/signout-with-chatgpt") {
        redirect(
          response,
          "/",
          `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        );
        return;
      }

      if (requestUrl.pathname === "/dashboard" && !isAuthenticated) {
        redirect(
          response,
          `/signin-with-chatgpt?return_to=${encodeURIComponent("/dashboard")}`,
        );
        return;
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value) headers.set(name, Array.isArray(value) ? value.join(",") : value);
      }
      headers.set("accept", headers.get("accept") ?? "text/html");
      headers.set("host", "spectra-atlas.local");
      if (isAuthenticated) {
        headers.set("oai-authenticated-user-email", AUTHORIZED_EMAIL);
        headers.set(
          "oai-authenticated-user-full-name",
          encodeURIComponent("本机授权用户"),
        );
        headers.set(
          "oai-authenticated-user-full-name-encoding",
          "percent-encoded-utf-8",
        );
      }

      const worker = await getWorker();
      const workerResponse = await worker.fetch(
        new Request(
          `https://spectra-atlas.local${requestUrl.pathname}${requestUrl.search}`,
          { headers, method: request.method },
        ),
        {
          ASSETS: {
            fetch: async () => new Response("Not found", { status: 404 }),
          },
        },
        {
          passThroughOnException() {},
          waitUntil() {},
        },
      );

      await forwardWorkerResponse(workerResponse, response, !isAuthenticated);
    } catch (error) {
      console.error(error);
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      response.end("本机网站启动后发生错误，请关闭窗口后重新打开。");
    }
  });
}

export async function startLocalSecureServer({
  password,
  port = 4173,
  host = "127.0.0.1",
} = {}) {
  const server = createLocalSecureServer({ password });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, resolvePromise);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const password = process.env.SPECTRA_LOCAL_PASSWORD;
  const port = Number.parseInt(process.env.SPECTRA_LOCAL_PORT ?? "4173", 10);

  if (!password || password.length < 8) {
    console.error("无法启动：请通过启动脚本设置至少 8 个字符的本机访问密码。");
    process.exitCode = 1;
  } else {
    const server = await startLocalSecureServer({ password, port });
    console.log(`Spectra Atlas 已在 http://localhost:${port}/ 启动`);
    console.log("关闭此窗口即可停止网站并使本次密码失效。");

    const close = () => server.close(() => process.exit(0));
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
  }
}
