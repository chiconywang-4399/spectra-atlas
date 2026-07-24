import {
  createCipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PAGES_ROOT = resolve(PROJECT_ROOT, "github-pages");
const PAGES_PUBLIC = resolve(PAGES_ROOT, "public");
const OUTPUT_ROOT = resolve(PROJECT_ROOT, "github-pages-dist");
const ENCRYPTED_DATA = resolve(PAGES_PUBLIC, "spectral-data.enc.json");
const ITERATIONS = 600_000;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const password =
  argumentValue("--password") ?? process.env.SPECTRA_GITHUB_PAGES_PASSWORD;

if (!password || password.length < 14) {
  console.error(
    "GitHub Pages 访问密码至少需要 14 个字符；请使用 --password 或 SPECTRA_GITHUB_PAGES_PASSWORD。",
  );
  process.exit(1);
}

await mkdir(PAGES_PUBLIC, { recursive: true });

const plaintext = await readFile(
  resolve(PROJECT_ROOT, "app", "spectral-data.json"),
);
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const encryptedWithTag = Buffer.concat([ciphertext, cipher.getAuthTag()]);

await writeFile(
  ENCRYPTED_DATA,
  JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: encryptedWithTag.toString("base64"),
  }),
);
await copyFile(
  resolve(PROJECT_ROOT, "public", "favicon.svg"),
  resolve(PAGES_PUBLIC, "favicon.svg"),
);
await writeFile(resolve(PAGES_PUBLIC, ".nojekyll"), "");

try {
  await build({
    root: PAGES_ROOT,
    base: "./",
    publicDir: PAGES_PUBLIC,
    plugins: [react()],
    build: {
      outDir: OUTPUT_ROOT,
      emptyOutDir: true,
      sourcemap: false,
    },
    css: {
      postcss: resolve(PROJECT_ROOT),
    },
    logLevel: "info",
  });
} finally {
  await rm(ENCRYPTED_DATA, { force: true });
}

await copyFile(
  resolve(OUTPUT_ROOT, "index.html"),
  resolve(OUTPUT_ROOT, "404.html"),
);

console.log(`GitHub Pages build ready: ${OUTPUT_ROOT}`);
