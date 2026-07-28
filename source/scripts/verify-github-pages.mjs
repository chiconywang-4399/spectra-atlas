import {
  createDecipheriv,
  createHash,
  pbkdf2Sync,
} from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

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

if (!files.some((path) => path.endsWith("data\\spectra.sqlite") || path.endsWith("data/spectra.sqlite"))) {
  throw new Error("发布目录缺少 SQLite 数据库 data/spectra.sqlite。");
}
if (!files.some((path) => path.endsWith("assets\\sql-wasm.js") || path.endsWith("assets/sql-wasm.js"))) {
  throw new Error("发布目录缺少 SQLite 浏览器引擎 sql-wasm.js。");
}
if (!files.some((path) => path.endsWith("assets\\sql-wasm.wasm") || path.endsWith("assets/sql-wasm.wasm"))) {
  throw new Error("发布目录缺少 SQLite WebAssembly 文件 sql-wasm.wasm。");
}

const SQL = await initSqlJs();
const databaseBytes = await readFile(resolve(OUTPUT_ROOT, "data", "spectra.sqlite"));
const db = new SQL.Database(databaseBytes);
const sqliteCount = db.exec("select count(*) from spectra")[0]?.values?.[0]?.[0];
if (sqliteCount < 38) {
  throw new Error(`SQLite 数据库记录数异常：${sqliteCount}`);
}
const encryptedRecord = db.exec(
  "select encrypted_record from spectra where technique = 'raman' limit 1",
)[0]?.values?.[0]?.[0];
db.close();
if (!encryptedRecord || encryptedRecord === "{}") {
  throw new Error("SQLite 数据库没有保存可解密的加密光谱记录。");
}
const sqlitePayload = JSON.parse(encryptedRecord);
const sqliteSalt = Buffer.from(sqlitePayload.salt, "base64");
const sqliteIv = Buffer.from(sqlitePayload.iv, "base64");
const sqliteEncryptedWithTag = Buffer.from(sqlitePayload.ciphertext, "base64");
const sqliteTag = sqliteEncryptedWithTag.subarray(sqliteEncryptedWithTag.length - 16);
const sqliteCiphertext = sqliteEncryptedWithTag.subarray(0, sqliteEncryptedWithTag.length - 16);
const sqliteKey = pbkdf2Sync(password, sqliteSalt, sqlitePayload.iterations, 32, "sha256");
const sqliteDecipher = createDecipheriv("aes-256-gcm", sqliteKey, sqliteIv);
sqliteDecipher.setAuthTag(sqliteTag);
const sqliteDecrypted = Buffer.concat([
  sqliteDecipher.update(sqliteCiphertext),
  sqliteDecipher.final(),
]);
const sqliteRecord = JSON.parse(sqliteDecrypted.toString("utf8"));
if (!Array.isArray(sqliteRecord.points) || sqliteRecord.points.length < 2) {
  throw new Error("SQLite 加密记录解密后缺少可绘图 points。");
}

console.log(
  JSON.stringify({
    decryptedMatchesSource: true,
    plaintextDataAbsent: true,
    relativeAssetPaths: true,
    sqliteDatabaseReady: true,
    sqliteRecords: sqliteCount,
    encryptedPayloadBytes: encryptedWithTag.length,
    outputFiles: files.length,
  }),
);
