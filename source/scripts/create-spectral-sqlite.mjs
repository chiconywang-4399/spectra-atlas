import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPO_ROOT = resolve(PROJECT_ROOT, "..");
const OUTPUT_PATH = resolve(REPO_ROOT, "data", "spectra.sqlite");
const SOURCE_DATA_PATH = resolve(PROJECT_ROOT, "app", "spectral-data.json");
const ITERATIONS = 600_000;

const password =
  process.argv.includes("--password")
    ? process.argv[process.argv.indexOf("--password") + 1]
    : process.env.SPECTRA_GITHUB_PAGES_PASSWORD;

function encryptJson(value) {
  if (!password) return "{}";
  const plaintext = Buffer.from(JSON.stringify(value));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString("base64"),
  });
}

function extrema(points, index) {
  const values = points.map((point) => point[index]).filter(Number.isFinite);
  return values.length ? [Math.min(...values), Math.max(...values)] : [null, null];
}

function insertRecord(db, record) {
  db.run("DELETE FROM spectra WHERE id = ?", [record.id]);
  db.run(
    `INSERT INTO spectra (
      id, technique, label, source_file, uploaded_at, point_count,
      x_min, x_max, y_min, y_max, sha256, tags, encrypted_record
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.technique,
      record.label,
      record.sourceFile,
      record.uploadedAt,
      record.pointCount,
      record.xMin,
      record.xMax,
      record.yMin,
      record.yMax,
      record.sha256,
      JSON.stringify(record.tags),
      record.encryptedRecord,
    ],
  );
}

const SQL = await initSqlJs();
const db = new SQL.Database();

db.run(`
  PRAGMA user_version = 1;
  CREATE TABLE IF NOT EXISTS spectra (
    id TEXT PRIMARY KEY,
    technique TEXT NOT NULL,
    label TEXT NOT NULL,
    source_file TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    point_count INTEGER NOT NULL,
    x_min REAL,
    x_max REAL,
    y_min REAL,
    y_max REAL,
    sha256 TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    encrypted_record TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_spectra_technique ON spectra (technique);
  CREATE INDEX IF NOT EXISTS idx_spectra_uploaded_at ON spectra (uploaded_at);
  CREATE INDEX IF NOT EXISTS idx_spectra_label ON spectra (label);
  CREATE INDEX IF NOT EXISTS idx_spectra_source_file ON spectra (source_file);
`);

try {
  const spectralData = JSON.parse(await readFile(SOURCE_DATA_PATH, "utf8"));
  const uploadedAt = spectralData.generatedAt ?? new Date().toISOString();
  const groups = [
    ["raman", spectralData.raman.axis, spectralData.raman.series],
    ["uvvis", spectralData.uvvis.axis, spectralData.uvvis.series],
    ["ftir", spectralData.ftir.axis, spectralData.ftir.series],
  ];
  for (const [technique, axis, seriesList] of groups) {
    for (const series of seriesList) {
      const [xMin, xMax] = extrema(series.points, 0);
      const [yMin, yMax] = extrema(series.points, 1);
      insertRecord(db, {
        id: `seed-${technique}-${series.id}`,
        technique,
        label: series.label,
        sourceFile: series.sourcePath ?? `${technique}/${series.label}`,
        uploadedAt,
        pointCount: series.pointCount ?? series.points.length,
        xMin,
        xMax,
        yMin,
        yMax,
        sha256: null,
        tags: [technique, "seeded", "published-display"],
        encryptedRecord: encryptJson({
          schemaVersion: 1,
          id: `seed-${technique}-${series.id}`,
          technique,
          label: series.label,
          axis,
          points: series.points,
          source: {
            sourcePath: series.sourcePath,
            note: series.note,
          },
          uploadedAt,
        }),
      });
    }
  }

  for (const region of spectralData.xps.regions) {
    for (const series of region.series) {
      const [xMin, xMax] = extrema(series.points, 0);
      const [yMin, yMax] = extrema(series.points, 1);
      insertRecord(db, {
        id: `seed-xps-${region.id}-${series.id}`,
        technique: "xps",
        label: `${region.label} · ${series.label}`,
        sourceFile: region.sourcePath,
        uploadedAt,
        pointCount: series.pointCount ?? series.points.length,
        xMin,
        xMax,
        yMin,
        yMax,
        sha256: null,
        tags: ["xps", "seeded", region.id, "published-display"],
        encryptedRecord: encryptJson({
          schemaVersion: 1,
          id: `seed-xps-${region.id}-${series.id}`,
          technique: "xps",
          label: `${region.label} · ${series.label}`,
          axis: spectralData.xps.axis,
          points: series.points,
          source: {
            sourcePath: region.sourcePath,
            region: region.label,
          },
          uploadedAt,
        }),
      });
    }
  }
} catch (error) {
  console.warn(`SQLite seed skipped: ${error instanceof Error ? error.message : error}`);
}

await mkdir(resolve(REPO_ROOT, "data"), { recursive: true });
await writeFile(OUTPUT_PATH, Buffer.from(db.export()));
db.close();

console.log(
  `Created SQLite spectral database: ${OUTPUT_PATH}${password ? "" : " (metadata only; no password supplied)"}`,
);
