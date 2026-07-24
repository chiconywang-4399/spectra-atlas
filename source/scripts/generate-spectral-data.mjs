import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.resolve(projectRoot, "..");

const measurementFolders = ["Raman", "UV-VIS", "FT-IR", "XPS", "EUV-BEUV-T"];

const toNumber = (value) => {
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

async function readTwoColumn(filePath, { delimiter = /[\t,]+/, skip = 0 } = {}) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .slice(skip)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, second] = line.split(delimiter);
      const x = toNumber(first);
      const y = toNumber(second);
      return x === null || y === null ? null : [x, y];
    })
    .filter(Boolean);
}

async function readCsvObjects(filePath) {
  const lines = (await readFile(filePath, "utf8"))
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function downsample(points, target = 360) {
  if (points.length <= target) return points;
  const selected = [points[0]];
  const bucketSize = (points.length - 2) / (target - 2);
  let anchorIndex = 0;

  for (let bucket = 0; bucket < target - 2; bucket += 1) {
    const avgStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const avgEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, points.length);
    const averageSlice = points.slice(avgStart, avgEnd);
    const average = averageSlice.reduce(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
      [0, 0],
    );
    const averageX = average[0] / Math.max(averageSlice.length, 1);
    const averageY = average[1] / Math.max(averageSlice.length, 1);

    const rangeStart = Math.floor(bucket * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, points.length - 1);
    const anchor = points[anchorIndex];
    let maxArea = -1;
    let candidateIndex = rangeStart;

    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const point = points[index];
      const area = Math.abs(
        (anchor[0] - averageX) * (point[1] - anchor[1]) -
          (anchor[0] - point[0]) * (averageY - anchor[1]),
      );
      if (area > maxArea) {
        maxArea = area;
        candidateIndex = index;
      }
    }
    selected.push(points[candidateIndex]);
    anchorIndex = candidateIndex;
  }

  selected.push(points.at(-1));
  return selected;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nearest(points, x) {
  return points.reduce((best, point) =>
    Math.abs(point[0] - x) < Math.abs(best[0] - x) ? point : best,
  );
}

function peakIn(points, start, end) {
  const candidates = points.filter(([x]) => x >= start && x <= end);
  return candidates.reduce((best, point) => (point[1] > best[1] ? point : best));
}

async function collectInventory(folderName) {
  const root = path.join(dataRoot, folderName);
  const extensionCounts = {};
  let files = 0;
  let bytes = 0;
  let newest = 0;

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const details = await stat(fullPath);
        const extension = path.extname(entry.name).toLowerCase() || "(none)";
        files += 1;
        bytes += details.size;
        newest = Math.max(newest, details.mtimeMs);
        extensionCounts[extension] = (extensionCounts[extension] ?? 0) + 1;
      }
    }
  }

  await walk(root);
  return {
    name: folderName,
    files,
    sizeMb: Number((bytes / 1024 / 1024).toFixed(1)),
    newest: new Date(newest).toISOString().slice(0, 10),
    extensions: Object.entries(extensionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([extension, count]) => ({ extension, count })),
  };
}

const ramanSources = [
  {
    id: "hbn58",
    label: "hBN58",
    color: "#63e6be",
    path: ["Raman", "2026年6月30日", "hBN58.CSV"],
    note: "h-BN 样品，2026-06-30",
  },
  {
    id: "cnt-h5",
    label: "CNT · H₅",
    color: "#4dabf7",
    path: ["Raman", "2026年6月15日", "CNT", "H_CNT-5.CSV"],
    note: "CNT / H₂ 等离子体系列",
  },
  {
    id: "mo6",
    label: "Mo-6",
    color: "#ffd43b",
    path: ["Raman", "2026年6月15日", "Mo-6-1.CSV"],
    note: "Mo 溅射样品",
  },
  {
    id: "zr20",
    label: "Zr-20",
    color: "#ff8787",
    path: ["Raman", "2026年6月16日", "wjd", "Zr-20-1.CSV"],
    note: "Zr 系列样品",
  },
];

const ramanSeries = [];
for (const source of ramanSources) {
  const raw = await readTwoColumn(path.join(dataRoot, ...source.path));
  const peaks = {
    d: peakIn(raw, 1280, 1420),
    g: peakIn(raw, 1500, 1650),
    twoD: peakIn(raw, 2550, 2850),
  };
  ramanSeries.push({
    ...source,
    sourcePath: source.path.join("/"),
    pointCount: raw.length,
    points: downsample(raw),
    peaks,
  });
}

const uvBase = path.join(dataRoot, "UV-VIS");
const uvTxt = (...segments) => path.join(uvBase, ...segments);
const uvPaths = {
  cnt: [
    uvTxt("20260710透过率", "CNT-1.txt"),
    uvTxt("20260710透过率", "CNT-1 - 副本.txt"),
    uvTxt("20260710透过率", "CNT-1 - 副本 - 副本.txt"),
  ],
  mo8Without: uvTxt("20260710透过率", "Mo8wortp.txt"),
  mo8With: uvTxt("20260710透过率", "Mo8wrtp.txt"),
  mo9: [
    uvTxt("20260713透过率", "Mo-9-1.txt"),
    uvTxt("20260713透过率", "Mo-9-1 - 副本.txt"),
    uvTxt("20260713透过率", "Mo-9-2.txt"),
    uvTxt("20260713透过率", "Mo-9-2 - 副本.txt"),
  ],
};

const cntScans = await Promise.all(uvPaths.cnt.map((file) => readTwoColumn(file, { delimiter: /\t+/, skip: 2 })));
const mo9Scans = await Promise.all(uvPaths.mo9.map((file) => readTwoColumn(file, { delimiter: /\t+/, skip: 2 })));
const mo8WithoutRaw = await readTwoColumn(uvPaths.mo8Without, { delimiter: /\t+/, skip: 2 });
const mo8WithRaw = await readTwoColumn(uvPaths.mo8With, { delimiter: /\t+/, skip: 2 });
const wavelengthGrid = cntScans[0].map((point) => point[0]);
const cntMean = wavelengthGrid.map((_, index) => mean(cntScans.map((scan) => scan[index][1])));

function ratioSeries(scans) {
  return wavelengthGrid
    .map((wavelength, index) => [
      wavelength,
      (mean(scans.map((scan) => scan[index][1])) / cntMean[index]) * 100,
    ])
    .filter(([wavelength]) => wavelength >= 300 && wavelength <= 1690);
}

const uvSeries = [
  {
    id: "mo8-no-rtp",
    label: "Mo8 · 400 s · 无 RTP",
    color: "#63e6be",
    points: downsample(ratioSeries([mo8WithoutRaw])),
  },
  {
    id: "mo8-rtp",
    label: "Mo8 · 400 s · RTP",
    color: "#c77dff",
    points: downsample(ratioSeries([mo8WithRaw])),
  },
  {
    id: "mo9-4000",
    label: "Mo9 · 4000 s · 4 次均值",
    color: "#4dabf7",
    points: downsample(ratioSeries(mo9Scans)),
  },
];

for (const series of uvSeries) {
  series.metrics = {
    t550: nearest(series.points, 550)[1],
    t800: nearest(series.points, 800)[1],
    t1000: nearest(series.points, 1000)[1],
    t1500: nearest(series.points, 1500)[1],
  };
}

const ftirFolder = path.join(
  dataRoot,
  "work",
  "ftir-extract",
  "20260722-xiaowai-zhangshanting-wangkangkang",
);
const ftirSeries = [];
for (const [id, filename, label, color] of [
  ["tr", "260717 TR.txt", "260717 TR", "#4dabf7"],
  ["tr2", "260717 TR-2.txt", "260717 TR-2", "#ffb86b"],
]) {
  const raw = await readTwoColumn(path.join(ftirFolder, filename), { delimiter: /\t+/ });
  ftirSeries.push({
    id,
    label,
    color,
    pointCount: raw.length,
    points: downsample(raw.map(([x, y]) => [x, y * 100])),
    sourcePath: `FT-IR/20260722-xiaowai-zhangshanting-wangkangkang.rar/${filename}`,
  });
}

const xpsRoot = path.join(dataRoot, "XPS", "20260720", "Mo-10_XPS_peak_fitting");
const xpsRegionFiles = [
  ["mo3d", "Mo 3d", "Mo10_Mo3d_fit_curves.csv"],
  ["n1s", "N 1s / Mo 3p", "Mo10_N1s_Mo3p_fit_curves.csv"],
  ["o1s", "O 1s", "Mo10_O1s_fit_curves.csv"],
  ["c1s", "C 1s", "Mo10_C1s_fit_curves.csv"],
];
const xpsRegions = [];

for (const [id, label, filename] of xpsRegionFiles) {
  const rows = await readCsvObjects(path.join(xpsRoot, filename));
  const headers = Object.keys(rows[0]);
  const componentHeaders = headers.filter((header) => header.startsWith("component_"));
  const series = [
    {
      id: "measured",
      label: "实测",
      color: "#edf2ff",
      points: rows.map((row) => [toNumber(row.binding_energy_eV), toNumber(row.measured_counts_per_s)]),
    },
    {
      id: "fit",
      label: "总拟合",
      color: "#ff6b6b",
      points: rows.map((row) => [toNumber(row.binding_energy_eV), toNumber(row.total_fit_counts_per_s)]),
    },
    {
      id: "background",
      label: "Shirley 背景",
      color: "#868e96",
      points: rows.map((row) => [toNumber(row.binding_energy_eV), toNumber(row.shirley_background_counts_per_s)]),
    },
    ...componentHeaders.map((header, index) => ({
      id: header,
      label: header
        .replace(/^component_/, "")
        .replace(/_counts_per_s$/, "")
        .replaceAll("_", " ")
        .replace("low BE Mo 0", "低结合能 Mo")
        .replace("Mo 4", "Mo⁴⁺")
        .replace("Mo 6", "Mo⁶⁺")
        .replace("lattice O 2", "晶格 O²⁻")
        .replace("OH defect O", "OH / 缺陷 O")
        .replace("adsorbed O", "吸附 O"),
      color: ["#4dabf7", "#63e6be", "#ffd43b", "#c77dff", "#ffb86b", "#74c0fc"][index % 6],
      points: rows.map((row) => [toNumber(row.binding_energy_eV), toNumber(row[header])]),
      component: true,
    })),
  ];
  xpsRegions.push({
    id,
    label,
    sourcePath: `XPS/20260720/Mo-10_XPS_peak_fitting/${filename}`,
    series,
  });
}

const fitSummary = JSON.parse(await readFile(path.join(xpsRoot, "fit_summary.json"), "utf8"));
const xpsFitQuality = Object.entries(fitSummary.fits).map(([region, value]) => ({
  region,
  rSquared: value.r_squared,
  aicc: value.aicc,
}));
const xpsFitResults = (await readCsvObjects(path.join(xpsRoot, "Mo10_XPS_fit_results.csv"))).map((row) => ({
  region: row.region,
  state: row.chemical_state
    .replaceAll("$", "")
    .replaceAll("^", "")
    .replaceAll("{", "")
    .replaceAll("}", "")
    .replace("\\pi", "π"),
  energy: toNumber(row.binding_energy_eV),
  fwhm: toNumber(row.fwhm_eV),
  fraction: toNumber(row.state_fraction_pct),
}));

const inventory = await Promise.all(measurementFolders.map(collectInventory));
const payload = {
  generatedAt: new Date().toISOString(),
  inventory,
  totals: {
    files: inventory.reduce((sum, item) => sum + item.files, 0),
    sizeMb: Number(inventory.reduce((sum, item) => sum + item.sizeMb, 0).toFixed(1)),
    plottedSeries:
      ramanSeries.length +
      uvSeries.length +
      ftirSeries.length +
      xpsRegions.reduce((sum, region) => sum + region.series.length, 0),
  },
  raman: {
    axis: { x: "Raman shift (cm⁻¹)", y: "Intensity (counts)" },
    series: ramanSeries,
  },
  uvvis: {
    axis: { x: "Wavelength (nm)", y: "Relative transmission vs CNT (%)" },
    series: uvSeries,
    note: "相对透射比 = 镀膜样品强度 / 未镀膜 CNT 平均强度；Mo9/CNT 为跨日比较，不等同于绝对仪器透过率。",
  },
  ftir: {
    axis: { x: "Wavenumber (cm⁻¹)", y: "Transmittance (%)" },
    series: ftirSeries,
  },
  xps: {
    axis: { x: "Binding energy (eV)", y: "Counts per second" },
    sample: "Mo-10",
    sampleDate: fitSummary.sample_date,
    chargeReference: fitSummary.charge_reference,
    fitQuality: xpsFitQuality,
    fitResults: xpsFitResults,
    regions: xpsRegions,
    caveat: fitSummary.critical_caveat,
  },
};

await writeFile(
  path.join(projectRoot, "app", "spectral-data.json"),
  `${JSON.stringify(payload)}\n`,
  "utf8",
);

console.log(
  `Generated app/spectral-data.json: ${payload.totals.files} files indexed, ${payload.totals.plottedSeries} plotted series.`,
);
