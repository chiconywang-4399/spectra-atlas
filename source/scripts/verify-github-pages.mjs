import {
  createDecipheriv,
  createHash,
  pbkdf2Sync,
} from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT_ROOT = resolve(PROJECT_ROOT, "github-pages-dist");
const password = process.env.SPECTRA_GITHUB_PAGES_PASSWORD;

if (!password) {
  console.error("缺少 SPECTRA_GITHUB_PAGES_PASSWORD，无法验证加密构建。");
  process.exit(1);
}

const payload = JSON.parse(
  await readFile(resolve(OUTPUT_ROOT, "spectral-data.enc.json"), "utf8"),
);
const salt = Buffer.from(payload.salt, "base64");
const iv = Buffer.from(payload.iv, "base64");
const encryptedWithTag = Buffer.from(payload.ciphertext, "base64");
const tag = encryptedWithTag.subarray(encryptedWithTag.length - 16);
const ciphertext = encryptedWithTag.subarray(0, encryptedWithTag.length - 16);
const key = pbkdf2Sync(password, salt, payload.iterations, 32, "sha256");
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
const decrypted = Buffer.concat([
  decipher.update(ciphertext),
  decipher.final(),
]);
const source = await readFile(
  resolve(PROJECT_ROOT, "app", "spectral-data.json"),
);

const digest = (value) => createHash("sha256").update(value).digest("hex");
if (digest(decrypted) !== digest(source)) {
  throw new Error("加密文件解密后与源数据不一致。");
}

const sourceData = JSON.parse(source.toString("utf8"));
const sensitiveNeedles = [
  sourceData.raman.series[0]?.label,
  sourceData.raman.series[0]?.id,
  String(sourceData.raman.series[0]?.points?.[7]?.[0]),
  String(sourceData.raman.series[0]?.points?.[7]?.[1]),
  sourceData.xps.regions[0]?.sourcePath,
].filter(Boolean);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const files = await collectFiles(OUTPUT_ROOT);
const inspectableFiles = files.filter(
  (path) =>
    !path.endsWith("spectral-data.enc.json") &&
    [".css", ".html", ".js", ".json", ".svg"].includes(
      extname(path).toLowerCase(),
    ),
);

for (const path of inspectableFiles) {
  const content = await readFile(path, "utf8");
  for (const needle of sensitiveNeedles) {
    if (content.includes(needle)) {
      throw new Error("未加密的发布文件中发现了实验数据标识。");
    }
  }
}

const indexHtml = await readFile(resolve(OUTPUT_ROOT, "index.html"), "utf8");
if (!indexHtml.includes('src="./assets/') || !indexHtml.includes('href="./assets/')) {
  throw new Error("GitHub Pages 资源路径不是相对路径。");
}
if (files.some((path) => path.endsWith("spectral-data.json"))) {
  throw new Error("发布目录包含未加密的 spectral-data.json。");
}

console.log(
  JSON.stringify({
    decryptedMatchesSource: true,
    plaintextDataAbsent: true,
    relativeAssetPaths: true,
    encryptedPayloadBytes: encryptedWithTag.length,
    outputFiles: files.length,
  }),
);
