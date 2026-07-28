"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = [number, number];

type SpectrumSeries = {
  id: string;
  label: string;
  color: string;
  points: Point[];
  note?: string;
  sourcePath?: string;
  pointCount?: number;
  component?: boolean;
  metrics?: {
    t550: number;
    t800: number;
    t1000: number;
    t1500: number;
  };
  peaks?: {
    d: Point;
    g: Point;
    twoD: Point;
  };
};

type InventoryItem = {
  name: string;
  files: number;
  sizeMb: number;
  newest: string;
  extensions: { extension: string; count: number }[];
};

export type SpectralData = {
  generatedAt: string;
  inventory: InventoryItem[];
  totals: { files: number; sizeMb: number; plottedSeries: number };
  raman: {
    axis: { x: string; y: string };
    series: SpectrumSeries[];
  };
  uvvis: {
    axis: { x: string; y: string };
    series: SpectrumSeries[];
    note: string;
  };
  ftir: {
    axis: { x: string; y: string };
    series: SpectrumSeries[];
  };
  xps: {
    axis: { x: string; y: string };
    sample: string;
    sampleDate: string;
    chargeReference: {
      line: string;
      target_binding_energy_eV: number;
      applied_shift_eV: number;
    };
    fitQuality: { region: string; rSquared: number; aicc: number }[];
    fitResults: {
      region: string;
      state: string;
      energy: number;
      fwhm: number;
      fraction: number;
    }[];
    regions: {
      id: string;
      label: string;
      sourcePath: string;
      series: SpectrumSeries[];
    }[];
    caveat: string;
  };
};

type Technique = "raman" | "uvvis" | "ftir" | "xps";
type UploadTechnique = "raman" | "uvvis";
type PaletteId = "xps-fixed" | "okabe-ito" | "tol-vibrant" | "mono";
type ChartExportPresetId = "paper-single" | "paper-double" | "slides-hd";

type SpectralDatabaseRecord = {
  id: string;
  technique: Technique | "mixed";
  label: string;
  sourceFile: string;
  uploadedAt: string;
  pointCount: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  sha256?: string;
  tags?: string[];
  encryptedRecord?: string;
};

type EncryptedPayload = {
  version: number;
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

type UploadPreview = {
  technique: UploadTechnique;
  axis: { x: string; y: string };
  series: SpectrumSeries;
  rawText: string;
  fileName: string;
  sha256: string;
};

type WorkbookSheet = {
  name: string;
  rows: (string | number)[][];
};

type AdvantageXpsPreview = {
  fileName: string;
  regions: {
    id: string;
    label: string;
    sourcePath: string;
    series: SpectrumSeries[];
  }[];
  exportSections: ExportSection[];
};

const GITHUB_OWNER = "chiconywang-4399";
const GITHUB_REPO = "spectra-atlas";
const GITHUB_BRANCH = "main";
const DATABASE_PATH = "data/spectra.sqlite";
const RECORD_ITERATIONS = 600_000;

const techniqueInfo: Record<
  Technique,
  { eyebrow: string; name: string; caption: string; accent: string; code: string }
> = {
  raman: {
    eyebrow: "VIBRATIONAL",
    name: "Raman",
    caption: "Lattice vibration, D/G/2D bands, and defect-sensitive Raman features",
    accent: "#63e6be",
    code: "RA",
  },
  uvvis: {
    eyebrow: "OPTICAL",
    name: "UV-VIS-NIR",
    caption: "Relative transmittance across the 300-1690 nm optical window",
    accent: "#4dabf7",
    code: "UV",
  },
  ftir: {
    eyebrow: "VIBRATIONAL",
    name: "FTIR",
    caption: "Mid-infrared transmittance converted to wavelength coordinates",
    accent: "#ffb86b",
    code: "IR",
  },
  xps: {
    eyebrow: "SURFACE",
    name: "XPS",
    caption: "High-resolution peak fitting, background, and chemical states",
    accent: "#c77dff",
    code: "XP",
  },
};

const rangeOptions: Record<Technique, { id: string; label: string; range?: [number, number] }[]> = {
  raman: [
    { id: "full", label: "Full spectrum" },
    { id: "dg", label: "D / G bands", range: [1200, 1700] },
    { id: "2d", label: "2D band", range: [2400, 2900] },
  ],
  uvvis: [
    { id: "full", label: "Full range" },
    { id: "vis", label: "Visible range", range: [400, 780] },
    { id: "nir", label: "Near infrared", range: [780, 1690] },
  ],
  ftir: [
    { id: "full", label: "Full spectrum" },
    { id: "functional", label: "Functional groups - 2.5-6.7 um", range: [2.5, 6.7] },
    { id: "fingerprint", label: "Fingerprint - 6.7-16.7 um", range: [6.7, 16.7] },
  ],
  xps: [{ id: "full", label: "Current region" }],
};

const plotAxisLabels: Record<Technique, { x: string; y: string }> = {
  raman: { x: "Raman shift (cm^-1)", y: "Intensity (a.u.)" },
  uvvis: { x: "Wavelength (nm)", y: "Transmittance (%)" },
  ftir: { x: "Wavelength (um)", y: "Transmittance (%)" },
  xps: { x: "Binding energy (eV)", y: "Intensity (a.u.)" },
};

const plotTitles: Record<Technique, string> = {
  raman: "Raman spectra",
  uvvis: "UV-VIS spectra",
  ftir: "FTIR spectra",
  xps: "XPS fitted spectra",
};

const plotRangeOptions: Record<Technique, { id: string; label: string; range?: [number, number] }[]> = {
  raman: [
    { id: "full", label: "Full spectrum" },
    { id: "dg", label: "D / G bands", range: [1200, 1700] },
    { id: "2d", label: "2D band", range: [2400, 2900] },
  ],
  uvvis: [
    { id: "full", label: "Full range" },
    { id: "vis", label: "Visible range", range: [400, 780] },
    { id: "nir", label: "Near infrared", range: [780, 1690] },
  ],
  ftir: [
    { id: "full", label: "Full spectrum" },
    { id: "functional", label: "Functional groups - 2.5-6.7 um", range: [2.5, 6.7] },
    { id: "fingerprint", label: "Fingerprint - 6.7-16.7 um", range: [6.7, 16.7] },
  ],
  xps: [{ id: "full", label: "Current region" }],
};

const paletteOptions: { id: PaletteId; label: string; colors: string[] }[] = [
  {
    id: "xps-fixed",
    label: "XPS fixed / Okabe-Ito",
    colors: ["#1f2937", "#D62728", "#0072B2", "#009E73", "#E69F00", "#CC79A7", "#56B4E9", "#D55E00"],
  },
  {
    id: "okabe-ito",
    label: "Okabe-Ito colorblind-safe",
    colors: ["#000000", "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7"],
  },
  {
    id: "tol-vibrant",
    label: "Paul Tol vibrant",
    colors: ["#0077BB", "#EE7733", "#33BBEE", "#EE3377", "#CC3311", "#009988", "#BBBBBB"],
  },
  {
    id: "mono",
    label: "Mono / grayscale",
    colors: ["#111111", "#555555", "#888888", "#BBBBBB", "#D9D9D9"],
  },
];

const paletteById = Object.fromEntries(paletteOptions.map((palette) => [palette.id, palette])) as Record<
  PaletteId,
  { id: PaletteId; label: string; colors: string[] }
>;

const exportPresets: Record<
  ChartExportPresetId,
  {
    label: string;
    widthMm?: number;
    widthPx?: number;
    dpi: number;
    fontPt: number;
    labelPt: number;
    axisPt: number;
    measuredPt: number;
    fitPt: number;
    componentPt: number;
    gridPt: number;
  }
> = {
  "paper-single": {
    label: "Paper single column 89 mm",
    widthMm: 89,
    dpi: 1000,
    fontPt: 6,
    labelPt: 7,
    axisPt: 0.6,
    measuredPt: 0.75,
    fitPt: 0.9,
    componentPt: 0.7,
    gridPt: 0.25,
  },
  "paper-double": {
    label: "Paper double column 183 mm",
    widthMm: 183,
    dpi: 1000,
    fontPt: 6.5,
    labelPt: 7,
    axisPt: 0.6,
    measuredPt: 0.8,
    fitPt: 0.95,
    componentPt: 0.75,
    gridPt: 0.25,
  },
  "slides-hd": {
    label: "Presentation wide 1920 px",
    widthPx: 1920,
    dpi: 220,
    fontPt: 13,
    labelPt: 15,
    axisPt: 1,
    measuredPt: 1.5,
    fitPt: 1.9,
    componentPt: 1.5,
    gridPt: 0.5,
  },
};

function applyPalette(series: SpectrumSeries[], paletteId: PaletteId, technique: Technique | UploadTechnique) {
  const withEnglishLabels = series.map((item) => ({
    ...item,
    label: englishSeriesLabel(item),
  }));
  if (paletteId === "xps-fixed" && technique === "xps") return withEnglishLabels;
  const palette = paletteById[paletteId] ?? paletteById["okabe-ito"];
  let componentIndex = 0;
  return withEnglishLabels.map((item, index) => {
    if (paletteId === "xps-fixed" && technique !== "xps") {
      return { ...item, color: palette.colors[index % palette.colors.length] };
    }
    if (item.id === "background") return { ...item, color: paletteId === "mono" ? "#9A9A9A" : "#7A7A7A" };
    if (item.id === "fit") return { ...item, color: paletteId === "mono" ? "#111111" : palette.colors[1] ?? "#D62728" };
    if (item.id === "measured") return { ...item, color: palette.colors[0] };
    const nextColor = palette.colors[(componentIndex + 2) % palette.colors.length];
    componentIndex += 1;
    return { ...item, color: nextColor };
  });
}

function englishSeriesLabel(item: SpectrumSeries) {
  const id = item.id.toLowerCase();
  if (item.id === "measured") return "Measured";
  if (item.id === "fit") return "Total fit";
  if (item.id === "background") return "Shirley background";
  if (id.includes("low_be_mo_0")) return "Low-BE Mo0/delta+";
  if (id.includes("mo_3p_low_be")) return "Mo 3p low-BE";
  if (id.includes("mo_3p_mo_4")) return "Mo 3p Mo4+";
  if (id.includes("mo_3p_mo_6")) return "Mo 3p Mo6+";
  if (id.includes("mo_4")) return "Mo4+";
  if (id.includes("mo_6")) return "Mo6+";
  if (id.includes("n_1s_i_counts")) return "N 1s-I";
  if (id.includes("n_1s_ii_counts")) return "N 1s-II";
  if (id.includes("lattice_o")) return "Lattice O2-";
  if (id.includes("oh_defect_o")) return "OH / defect O";
  if (id.includes("adsorbed_o")) return "Adsorbed O";
  if (id.includes("sp_2_c_c")) return "sp2 C=C";
  if (id.includes("sp_3_defect_c")) return "sp3 / defect C";
  if (id.includes("c_o_o_c_o")) return "C=O / O-C-O";
  if (id.includes("o_c_o")) return "O-C=O";
  if (id.includes("c_o")) return "C-O";
  if (id.includes("pi_pi_loss")) return "pi-pi* loss";
  return item.label
    .replaceAll(" · ", " - ")
    .replace("无 RTP", "no RTP")
    .replace(/(\d+)\s*次均值/g, "$1-run mean")
    .replace("均值", "mean");
}

function subtractPointSeries(series: SpectrumSeries, background: SpectrumSeries, id: string, label: string): SpectrumSeries {
  const backgroundByX = new Map(background.points.map(([x, y]) => [Number(x.toFixed(6)), y]));
  return {
    ...series,
    id,
    label,
    color: series.color,
    points: series.points.map(([x, y]) => [x, y - (backgroundByX.get(Number(x.toFixed(6))) ?? 0)] as Point),
    pointCount: series.points.length,
  };
}

function residualSeries(measured: SpectrumSeries, fit: SpectrumSeries): SpectrumSeries {
  const fitByX = new Map(fit.points.map(([x, y]) => [Number(x.toFixed(6)), y]));
  return {
    ...measured,
    id: "residual_measured_minus_total_fit",
    label: "Residual: measured - total fit",
    color: "#6B7280",
    points: measured.points.map(([x, y]) => [x, y - (fitByX.get(Number(x.toFixed(6))) ?? 0)] as Point),
    pointCount: measured.points.length,
  };
}

function buildXpsExportSeries(series: SpectrumSeries[]) {
  const background = series.find((item) => item.id === "background");
  const measured = series.find((item) => item.id === "measured");
  const fit = series.find((item) => item.id === "fit");
  if (!background) return series;
  const backgroundSubtracted = series
    .filter((item) => item.id !== "background")
    .map((item) =>
      subtractPointSeries(
        item,
        background,
        `${item.id}_background_subtracted`,
        `${item.label} (background-subtracted)`,
      ),
    );
  return [
    ...series,
    ...backgroundSubtracted,
    ...(measured && fit ? [residualSeries(measured, fit)] : []),
  ];
}

function xpsExportSections(
  regionLabel: string,
  data: SpectralData["xps"],
): ExportSection[] {
  const fitRows = data.fitResults
    .filter((row) => row.region === regionLabel)
    .map((row) => [
      row.region,
      row.state,
      row.energy,
      row.fwhm,
      row.fraction,
    ]);
  const qualityRows = data.fitQuality
    .filter((row) => row.region === regionLabel)
    .map((row) => [row.region, row.rSquared, row.aicc]);
  return [
    {
      title: "xps_export_inventory",
      headers: ["data_product", "description"],
      units: ["", ""],
      comments: ["Exported table name", "Meaning of the exported data product"],
      rows: [
        ["measured", "Original measured XPS intensity at each binding-energy point."],
        ["total_fit", "Total fitted envelope at each binding-energy point."],
        ["shirley_background", "Shirley background curve used for the fit."],
        ["deconvoluted_components", "All fitted chemical-state/component curves included in the selected region."],
        ["background_subtracted", "Measured, total-fit, and component curves after subtracting the Shirley background."],
        ["residual", "Point-wise residual calculated as measured intensity minus total fit."],
        ["fit_metadata", "Peak binding energy, FWHM, area fraction, fit quality, and charge reference."],
      ],
    },
    {
      title: "xps_fit_parameters",
      headers: ["region", "component", "binding_energy_eV", "fwhm_eV", "area_percent"],
      units: ["", "", "eV", "eV", "%"],
      comments: ["XPS region", "Fitted chemical-state/component label", "Peak binding energy", "Full width at half maximum", "Peak area fraction"],
      rows: fitRows,
    },
    {
      title: "xps_fit_quality",
      headers: ["region", "r_squared", "aicc"],
      units: ["", "", ""],
      comments: ["XPS region", "Coefficient of determination", "Akaike information criterion with correction"],
      rows: qualityRows,
    },
    {
      title: "xps_charge_reference",
      headers: ["reference_line", "target_binding_energy_eV", "applied_shift_eV"],
      units: ["", "eV", "eV"],
      comments: ["Charge correction reference", "Reference binding energy", "Applied binding-energy shift"],
      rows: [[
        data.chargeReference.line,
        data.chargeReference.target_binding_energy_eV,
        data.chargeReference.applied_shift_eV,
      ]],
    },
  ];
}

const compact = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (absolute >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (absolute >= 100) return value.toFixed(0);
  if (absolute >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

const fixed = (value: number, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : "NA";

const uploadAxis = (technique: UploadTechnique) =>
  technique === "raman"
    ? plotAxisLabels.raman
    : plotAxisLabels.uvvis;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const parseSpectrumText = (
  rawText: string,
  technique: UploadTechnique,
  fileName: string,
  label: string,
  sha256: string,
): UploadPreview => {
  const points: Point[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const normalized = line.trim().replace(/,/g, " ");
    if (!normalized || normalized.startsWith("#")) continue;
    const matches = normalized.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?/g);
    if (!matches || matches.length < 2) continue;
    const x = Number(matches[0]);
    const y = Number(matches[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
  }

  if (points.length < 2) {
    throw new Error("Could not parse enough two-column numeric data. Use CSV/TXT and make sure each row contains at least x and y values.");
  }

  points.sort((a, b) => a[0] - b[0]);
  const yValues = points.map((point) => point[1]);
  const shouldPercentScale =
    technique === "uvvis" &&
    Math.min(...yValues) >= 0 &&
    Math.max(...yValues) <= 1.5;
  const plottedPoints = shouldPercentScale
    ? points.map(([x, y]) => [x, y * 100] as Point)
    : points;
  const step = Math.max(Math.ceil(plottedPoints.length / 3500), 1);
  const sampledPoints = plottedPoints.filter((_, index) => index % step === 0);
  if (sampledPoints[sampledPoints.length - 1] !== plottedPoints[plottedPoints.length - 1]) {
    sampledPoints.push(plottedPoints[plottedPoints.length - 1]);
  }

  const id = `${technique}-${Date.now().toString(36)}-${sha256.slice(0, 8)}`;
  return {
    technique,
    axis: uploadAxis(technique),
    rawText,
    fileName,
    sha256,
    series: {
      id,
      label: label.trim() || fileName.replace(/\.[^.]+$/, ""),
      color: technique === "raman" ? "#9ff2d7" : "#8ecbff",
      points: sampledPoints,
      pointCount: plottedPoints.length,
      note: shouldPercentScale ? "UV-VIS values were detected in the 0-1 range and converted to percent." : undefined,
      sourcePath: `GitHub database upload - ${fileName}`,
    },
  };
};

const cleanCell = (value: string | number | undefined) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();

const toFiniteNumber = (value: string | number | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = cleanCell(value).replace(/,/g, "");
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
};

const columnIndexFromRef = (cellRef: string) => {
  const letters = (cellRef.match(/^[A-Z]+/i)?.[0] ?? "").toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(index - 1, 0);
};

const inflateRaw = async (bytes: Uint8Array) => {
  const Decompression = (globalThis as typeof globalThis & {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;
  if (!Decompression) {
    throw new Error("This browser cannot decompress XLSX files. Use a recent Chrome/Edge browser.");
  }
  const blobPart = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(blobPart).set(bytes);
  const stream = new Blob([blobPart]).stream().pipeThrough(new Decompression("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZipEntries = async (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocdOffset = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Could not read the XLSX zip directory.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let directoryOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, Uint8Array>();

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (view.getUint32(directoryOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(directoryOffset + 10, true);
    const compressedSize = view.getUint32(directoryOffset + 20, true);
    const nameLength = view.getUint16(directoryOffset + 28, true);
    const extraLength = view.getUint16(directoryOffset + 30, true);
    const commentLength = view.getUint16(directoryOffset + 32, true);
    const localOffset = view.getUint32(directoryOffset + 42, true);
    const name = decoder.decode(bytes.slice(directoryOffset + 46, directoryOffset + 46 + nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, await inflateRaw(compressed));

    directoryOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const parseXml = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

const xmlText = (node: Element | null | undefined) => node?.textContent ?? "";

const parseSharedStrings = (xml: string | undefined) => {
  if (!xml) return [];
  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t"))
      .map((node) => node.textContent ?? "")
      .join(""),
  );
};

const parseWorksheetRows = (xml: string, sharedStrings: string[]) => {
  const doc = parseXml(xml);
  const rows: (string | number)[][] = [];
  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const values: (string | number)[] = [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const columnIndex = columnIndexFromRef(cell.getAttribute("r") ?? "");
      const type = cell.getAttribute("t");
      const raw = xmlText(cell.getElementsByTagName("v")[0]);
      let value: string | number = "";
      if (type === "s") value = sharedStrings[Number(raw)] ?? "";
      else if (type === "inlineStr") value = Array.from(cell.getElementsByTagName("t")).map((node) => node.textContent ?? "").join("");
      else if (type === "str") value = raw;
      else if (raw !== "") {
        const numeric = Number(raw);
        value = Number.isFinite(numeric) ? numeric : raw;
      }
      values[columnIndex] = value;
    }
    while (values.length && cleanCell(values[values.length - 1]) === "") values.pop();
    rows.push(values);
  }
  return rows;
};

const normalizeXlsxPath = (target: string) => {
  const normalized = target.replace(/\\/g, "/").replace(/^\//, "");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
};

const parseXlsxWorkbook = async (buffer: ArrayBuffer): Promise<WorkbookSheet[]> => {
  const entries = await readZipEntries(buffer);
  const decoder = new TextDecoder("utf-8");
  const textEntry = (path: string) => {
    const bytes = entries.get(path);
    return bytes ? decoder.decode(bytes) : undefined;
  };
  const sharedStrings = parseSharedStrings(textEntry("xl/sharedStrings.xml"));
  const workbookXml = textEntry("xl/workbook.xml");
  const relsXml = textEntry("xl/_rels/workbook.xml.rels");
  if (!workbookXml) throw new Error("XLSX workbook.xml is missing.");

  const rels = new Map<string, string>();
  if (relsXml) {
    const relsDoc = parseXml(relsXml);
    for (const rel of Array.from(relsDoc.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) rels.set(id, normalizeXlsxPath(target));
    }
  }

  const workbookDoc = parseXml(workbookXml);
  const sheets: WorkbookSheet[] = [];
  for (const sheet of Array.from(workbookDoc.getElementsByTagName("sheet"))) {
    const name = sheet.getAttribute("name") ?? `Sheet ${sheets.length + 1}`;
    const relId = sheet.getAttribute("r:id") ?? sheet.getAttribute("id") ?? "";
    const path = rels.get(relId);
    const xml = path ? textEntry(path) : undefined;
    if (xml) sheets.push({ name, rows: parseWorksheetRows(xml, sharedStrings) });
  }

  if (sheets.length === 0) {
    for (const [path, bytes] of entries) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(path)) {
        sheets.push({ name: path.split("/").pop()?.replace(/\.xml$/i, "") ?? path, rows: parseWorksheetRows(decoder.decode(bytes), sharedStrings) });
      }
    }
  }

  return sheets;
};

const parseXmlOrHtmlWorkbook = (buffer: ArrayBuffer, fileName: string): WorkbookSheet[] => {
  const text = new TextDecoder("utf-8").decode(buffer);
  if (!/<(html|table|Workbook|Worksheet)\b/i.test(text)) {
    throw new Error(`Binary .xls files cannot be parsed locally. In Avantage, export or save the report as .xlsx/.xlsm and try again: ${fileName}`);
  }
  const doc = new DOMParser().parseFromString(text, text.includes("<html") ? "text/html" : "application/xml");
  const xmlWorksheets = Array.from(doc.getElementsByTagName("Worksheet"));
  if (xmlWorksheets.length) {
    return xmlWorksheets.map((worksheet, index) => ({
      name: worksheet.getAttribute("ss:Name") ?? worksheet.getAttribute("Name") ?? `Sheet ${index + 1}`,
      rows: Array.from(worksheet.getElementsByTagName("Row")).map((row) =>
        Array.from(row.getElementsByTagName("Cell")).map((cell) => {
          const text = cleanCell(cell.textContent ?? "");
          const numeric = toFiniteNumber(text);
          return numeric ?? text;
        }),
      ),
    }));
  }
  return Array.from(doc.getElementsByTagName("table")).map((table, index) => ({
    name: `Table ${index + 1}`,
    rows: Array.from(table.getElementsByTagName("tr")).map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) => {
        const text = cleanCell(cell.textContent ?? "");
        const numeric = toFiniteNumber(text);
        return numeric ?? text;
      }),
    ),
  }));
};

const parseExcelWorkbook = async (file: File): Promise<WorkbookSheet[]> => {
  const buffer = await file.arrayBuffer();
  const signature = new Uint8Array(buffer.slice(0, 4));
  if (signature[0] === 0x50 && signature[1] === 0x4b) return parseXlsxWorkbook(buffer);
  return parseXmlOrHtmlWorkbook(buffer, file.name);
};

const cleanAdvantageLabel = (label: string) =>
  cleanCell(label)
    .replace(/^Fitted\s+Peak\s+/i, "")
    .replace(/\s+Scan\s+/i, " ")
    .replace(/\s+/g, " ")
    .trim();

const classifyAdvantageColumn = (header: string, unit: string, measuredUsed: boolean) => {
  const text = `${header} ${unit}`.toLowerCase();
  if (/fitted\s+envelope|envelope|total\s+fit|sum\s+fit/.test(text)) return "fit";
  if (/backgnd|background|shirley/.test(text)) return "background";
  if (/fitted\s+peak|component|peak\s+/.test(text)) return "component";
  if (!measuredUsed && /counts|cps|intensity/.test(text)) return "measured";
  return header ? "component" : "";
};

const xpsComponentColor = (index: number) =>
  ["#0072B2", "#009E73", "#E69F00", "#CC79A7", "#56B4E9", "#D55E00", "#999999"][index % 7];

const buildAdvantageRegion = (sheet: WorkbookSheet, fileName: string) => {
  const headerIndex = sheet.rows.findIndex((row) =>
    row.some((cell) => /binding\s+energy|kinetic\s+energy/i.test(cleanCell(cell))),
  );
  if (headerIndex < 0) return null;
  const headers = sheet.rows[headerIndex] ?? [];
  const units = sheet.rows[headerIndex + 1] ?? [];
  const xColumn = headers.findIndex((cell) => /binding\s+energy|kinetic\s+energy/i.test(cleanCell(cell)));
  if (xColumn < 0) return null;

  const rows = sheet.rows.slice(headerIndex + 2);
  let measuredUsed = false;
  let componentIndex = 0;
  const series: SpectrumSeries[] = [];
  const maxColumns = Math.max(...sheet.rows.map((row) => row.length), 0);

  for (let column = 0; column < maxColumns; column += 1) {
    if (column === xColumn) continue;
    const header = cleanCell(headers[column]);
    const unit = cleanCell(units[column]);
    const role = classifyAdvantageColumn(header, unit, measuredUsed);
    if (!role) continue;

    const points = rows
      .map((row) => {
        const x = toFiniteNumber(row[xColumn]);
        const y = toFiniteNumber(row[column]);
        return x !== undefined && y !== undefined ? ([x, y] as Point) : undefined;
      })
      .filter((point): point is Point => Boolean(point));
    if (points.length < 3) continue;

    const id =
      role === "measured"
        ? "measured"
        : role === "fit"
          ? "fit"
          : role === "background"
            ? "background"
            : `component_${componentIndex}_${safeExportName(header || `component-${column}`).toLowerCase()}`;
    const label =
      role === "measured"
        ? "Measured"
        : role === "fit"
          ? "Total fit"
          : role === "background"
            ? "Shirley background"
            : cleanAdvantageLabel(header || `Component ${componentIndex + 1}`);
    series.push({
      id,
      label,
      color:
        role === "measured"
          ? "#1f2937"
          : role === "fit"
            ? "#D62728"
            : role === "background"
              ? "#7A7A7A"
              : xpsComponentColor(componentIndex),
      points,
      pointCount: points.length,
      component: role === "component",
      sourcePath: `Avantage Excel - ${fileName} - ${sheet.name}`,
    });
    if (role === "measured") measuredUsed = true;
    if (role === "component") componentIndex += 1;
  }

  if (!series.some((item) => item.id === "measured")) return null;
  return {
    id: safeExportName(sheet.name).toLowerCase(),
    label: cleanCell(sheet.name).replace(/\s+Scan$/i, "") || "XPS region",
    sourcePath: `Avantage Excel - ${fileName} - ${sheet.name}`,
    series,
  };
};

const extractAdvantagePeakTable = (sheets: WorkbookSheet[]): ExportSection[] => {
  const sections: ExportSection[] = [];
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) =>
      row.some((cell) => /^name$/i.test(cleanCell(cell))) &&
      row.some((cell) => /peak\s+be/i.test(cleanCell(cell))),
    );
    if (headerIndex < 0) continue;
    const headers = (sheet.rows[headerIndex] ?? []).map((cell) => cleanCell(cell) || "column");
    const rows = sheet.rows
      .slice(headerIndex + 1)
      .map((row) => headers.map((_, index) => row[index] ?? ""))
      .filter((row) => row.some((cell) => cleanCell(cell) !== ""));
    if (rows.length) {
      sections.push({
        title: "advantage_peak_table",
        headers,
        units: headers.map((header) => (/be|fwhm/i.test(header) ? "eV" : /atomic/i.test(header) ? "%" : "")),
        comments: headers.map(() => `Original Avantage peak table column from ${sheet.name}`),
        rows,
      });
    }
  }
  return sections;
};

const parseAdvantageXpsExcel = async (file: File): Promise<AdvantageXpsPreview> => {
  const sheets = await parseExcelWorkbook(file);
  const regions = sheets
    .map((sheet) => buildAdvantageRegion(sheet, file.name))
    .filter((region): region is AdvantageXpsPreview["regions"][number] => Boolean(region));
  if (regions.length === 0) {
    throw new Error("No Avantage XPS scan sheets were found. Expected a sheet with Binding Energy and Counts / s columns.");
  }
  return {
    fileName: file.name,
    regions,
    exportSections: extractAdvantagePeakTable(sheets),
  };
};

const encryptJson = async (password: string, value: unknown): Promise<EncryptedPayload> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: RECORD_ITERATIONS,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return {
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: RECORD_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted),
  };
};

const decryptJson = async <T,>(password: string, payload: EncryptedPayload): Promise<T> => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(payload.salt),
      iterations: payload.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
};

const loadSqlJs = (() => {
  let sqlPromise: Promise<any> | null = null;
  return () => {
    if (sqlPromise) return sqlPromise;
    sqlPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-spectra-sqlite="true"]',
      );
      const start = () => {
        if (!window.initSqlJs) {
          reject(new Error("SQLite engine was not loaded."));
          return;
        }
        window
          .initSqlJs({ locateFile: (file: string) => `./assets/${file}` })
          .then(resolve)
          .catch(reject);
      };
      if (window.initSqlJs) {
        start();
        return;
      }
      if (existing) {
        existing.addEventListener("load", start, { once: true });
        existing.addEventListener("error", () => reject(new Error("SQLite script failed to load.")), {
          once: true,
        });
        return;
      }
      const script = document.createElement("script");
      script.src = "./assets/sql-wasm.js";
      script.async = true;
      script.dataset.spectraSqlite = "true";
      script.addEventListener("load", start, { once: true });
      script.addEventListener("error", () => reject(new Error("SQLite script failed to load.")), {
        once: true,
      });
      document.head.appendChild(script);
    });
    return sqlPromise;
  };
})();

const createDatabaseSchema = (db: any) => {
  db.run(`
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
};

const rowsFromDatabase = (db: any): SpectralDatabaseRecord[] => {
  createDatabaseSchema(db);
  const result = db.exec(`
    SELECT id, technique, label, source_file, uploaded_at, point_count,
           x_min, x_max, y_min, y_max, sha256, tags, encrypted_record
    FROM spectra
    ORDER BY uploaded_at DESC
  `)[0];
  if (!result) return [];
  return result.values.map((row: unknown[]) => ({
    id: String(row[0]),
    technique: String(row[1]) as SpectralDatabaseRecord["technique"],
    label: String(row[2]),
    sourceFile: String(row[3]),
    uploadedAt: String(row[4]),
    pointCount: Number(row[5]),
    xMin: row[6] === null ? undefined : Number(row[6]),
    xMax: row[7] === null ? undefined : Number(row[7]),
    yMin: row[8] === null ? undefined : Number(row[8]),
    yMax: row[9] === null ? undefined : Number(row[9]),
    sha256: row[10] === null ? undefined : String(row[10]),
    tags: row[11] ? JSON.parse(String(row[11])) : [],
    encryptedRecord: String(row[12]),
  }));
};

const openHostedDatabase = async () => {
  const SQL = await loadSqlJs();
  const response = await fetch(`./${DATABASE_PATH}`, { cache: "no-store" });
  if (!response.ok) {
    const db = new SQL.Database();
    createDatabaseSchema(db);
    return db;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const db = new SQL.Database(bytes);
  createDatabaseSchema(db);
  return db;
};

const fetchGithubDatabase = async (token: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATABASE_PATH}?ref=${GITHUB_BRANCH}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (response.status === 404) return { sha: undefined, bytes: undefined };
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API ${response.status}: ${message.slice(0, 240)}`);
  }
  const file = (await response.json()) as { sha: string; content: string };
  return { sha: file.sha, bytes: base64ToBytes(file.content.replace(/\s/g, "")) };
};

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<any>;
  }
}

function nearestPoint(points: Point[], targetX: number) {
  let closest = points[0];
  let distance = Math.abs(points[0][0] - targetX);
  for (let index = 1; index < points.length; index += 1) {
    const nextDistance = Math.abs(points[index][0] - targetX);
    if (nextDistance < distance) {
      distance = nextDistance;
      closest = points[index];
    }
  }
  return closest;
}

type PreparedSeries = SpectrumSeries & { chartPoints: Point[] };
type ExportSection = {
  title: string;
  headers: string[];
  units?: string[];
  comments?: string[];
  rows: (string | number)[][];
};

function exportGeometry(presetId: ChartExportPresetId) {
  const preset = exportPresets[presetId] ?? exportPresets["paper-single"];
  const viewWidth = 1000;
  const viewHeight = 440;
  const aspect = viewHeight / viewWidth;
  const widthPx = preset.widthPx ?? Math.round(((preset.widthMm ?? 89) / 25.4) * preset.dpi);
  const heightPx = Math.round(widthPx * aspect);
  const widthValue = preset.widthMm ? `${preset.widthMm}mm` : `${widthPx}px`;
  const heightValue = preset.widthMm ? `${((preset.widthMm ?? 89) * aspect).toFixed(2)}mm` : `${heightPx}px`;
  const widthPt = preset.widthMm ? ((preset.widthMm ?? 89) / 25.4) * 72 : widthPx * (72 / 96);
  const unitsPerPt = viewWidth / widthPt;
  return {
    preset,
    viewWidth,
    viewHeight,
    widthPx,
    heightPx,
    widthValue,
    heightValue,
    fontUnits: preset.fontPt * unitsPerPt,
    labelUnits: preset.labelPt * unitsPerPt,
    axisUnits: preset.axisPt * unitsPerPt,
    measuredUnits: preset.measuredPt * unitsPerPt,
    fitUnits: preset.fitPt * unitsPerPt,
    componentUnits: preset.componentPt * unitsPerPt,
    gridUnits: preset.gridPt * unitsPerPt,
  };
}

function chartExportStyle(presetId: ChartExportPresetId) {
  const geometry = exportGeometry(presetId);
  return `
    .plot-surface{fill:#ffffff;stroke:#1f2937;stroke-width:${geometry.axisUnits.toFixed(3)}}
    .grid-line{display:none}
    .tick-mark{stroke:#1f2937;stroke-width:${geometry.axisUnits.toFixed(3)}}
    .axis-tick{fill:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:${geometry.fontUnits.toFixed(3)}px}
    .axis-label{fill:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:${geometry.labelUnits.toFixed(3)}px;font-weight:700}
    .hover-line{display:none}
  `;
}

function safeExportName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90) || "spectra-chart";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

function serializeChartSvg(svg: SVGSVGElement, title: string, presetId: ChartExportPresetId) {
  const geometry = exportGeometry(presetId);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", geometry.widthValue);
  clone.setAttribute("height", geometry.heightValue);
  clone.setAttribute("viewBox", `0 0 ${geometry.viewWidth} ${geometry.viewHeight}`);
  clone.querySelectorAll<SVGRectElement>(".plot-surface").forEach((rect) => {
    rect.setAttribute("rx", "0");
    rect.setAttribute("ry", "0");
  });
  clone.querySelectorAll<SVGPathElement>("path[data-export-line]").forEach((path) => {
    const seriesId = path.dataset.seriesId;
    const lineWidth =
      seriesId === "measured"
        ? geometry.measuredUnits
        : seriesId === "fit"
          ? geometry.fitUnits
          : geometry.componentUnits;
    path.removeAttribute("vector-effect");
    path.setAttribute("stroke-width", lineWidth.toFixed(3));
  });
  clone.querySelectorAll<SVGElement>(".grid-line").forEach((line) => {
    line.setAttribute("stroke-width", geometry.gridUnits.toFixed(3));
  });
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = chartExportStyle(presetId);
  clone.prepend(style);
  const titleNode = document.createElementNS("http://www.w3.org/2000/svg", "title");
  titleNode.textContent = title;
  clone.prepend(titleNode);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function exportChartSvg(svg: SVGSVGElement, title: string, fileStem: string, presetId: ChartExportPresetId) {
  downloadBlob(
    new Blob([serializeChartSvg(svg, title, presetId)], { type: "image/svg+xml;charset=utf-8" }),
    `${safeExportName(fileStem)}-${presetId}.svg`,
  );
}

async function exportChartPng(svg: SVGSVGElement, title: string, fileStem: string, presetId: ChartExportPresetId) {
  const geometry = exportGeometry(presetId);
  const url = URL.createObjectURL(
    new Blob([serializeChartSvg(svg, title, presetId)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("PNG export failed."));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = geometry.widthPx;
    canvas.height = geometry.heightPx;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png");
    });
    downloadBlob(pngBlob, `${safeExportName(fileStem)}-${presetId}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function axisParts(label: string) {
  const match = label.match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (!match) return { name: label, unit: "" };
  return { name: match[1].trim(), unit: match[2].trim() };
}

function originWideRows(prepared: PreparedSeries[], xLabel: string, yLabel: string): (string | number)[][] {
  const x = axisParts(xLabel);
  const y = axisParts(yLabel);
  const longNames = prepared.flatMap((item) => [
    `${item.label} ${x.name}`,
    `${item.label} ${y.name}`,
  ]);
  const units = prepared.flatMap(() => [x.unit, y.unit]);
  const designations = prepared.flatMap(() => ["X", "Y"]);
  const comments = prepared.flatMap((item) => [
    `X values for ${item.label}; series_id=${item.id}`,
    `Y values for ${item.label}; series_id=${item.id}`,
  ]);
  const maxRows = Math.max(...prepared.map((item) => item.chartPoints.length), 0);
  const dataRows: (string | number)[][] = Array.from({ length: maxRows }, (_, rowIndex) =>
    prepared.flatMap<string | number>((item) => {
      const point = item.chartPoints[rowIndex];
      return point ? [point[0], point[1]] : ["", ""];
    }),
  );
  return [longNames, units, designations, comments, ...dataRows];
}

function exportPlotData(
  prepared: PreparedSeries[],
  xLabel: string,
  yLabel: string,
  fileStem: string,
  format: "csv" | "txt",
  sections: ExportSection[] = [],
) {
  const separator = format === "csv" ? "," : "\t";
  const encode = format === "csv" ? csvCell : (value: string | number) => String(value).replace(/\t/g, " ");
  const blocks: (string | number)[][] = [
    ...originWideRows(prepared, xLabel, yLabel),
    ...sections.flatMap((section) => [
      [],
      [`# ${section.title}`],
      section.headers,
      ...(section.units ? [section.units] : []),
      ...(section.comments ? [section.comments] : []),
      ...section.rows,
    ]),
  ];
  const content = blocks.map((row) => row.map(encode).join(separator)).join("\n");
  downloadBlob(
    new Blob([`\uFEFF${content}`], { type: format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" }),
    `${safeExportName(fileStem)}.${format}`,
  );
}

function prepareSpectrumSeries(series: SpectrumSeries[], range: [number, number] | undefined, normalize: boolean | undefined) {
  return series
    .map((item) => {
      const filtered = range
        ? item.points.filter(([x]) => x >= Math.min(...range) && x <= Math.max(...range))
        : item.points;
      if (!normalize) return { ...item, chartPoints: filtered };
      const maxY = Math.max(...filtered.map((point) => Math.abs(point[1])), 1);
      return {
        ...item,
        chartPoints: filtered.map(([x, y]) => [x, (y / maxY) * 100] as Point),
      };
    })
    .filter((item) => item.chartPoints.length > 1);
}

function SpectrumChart({
  series,
  xLabel,
  yLabel,
  visible,
  range,
  reverseX,
  normalize,
  yDomain,
  yMinFloor,
  exportTitle,
  exportFileName,
  exportPresetId = "paper-single",
  exportSeries,
  exportSections = [],
}: {
  series: SpectrumSeries[];
  xLabel: string;
  yLabel: string;
  visible: Set<string>;
  range?: [number, number];
  reverseX?: boolean;
  normalize?: boolean;
  yDomain?: [number, number];
  yMinFloor?: number;
  exportTitle?: string;
  exportFileName?: string;
  exportPresetId?: ChartExportPresetId;
  exportSeries?: SpectrumSeries[];
  exportSections?: ExportSection[];
}) {
  const [hover, setHover] = useState<{
    viewX: number;
    left: number;
    top: number;
    dataX: number;
    entries: { label: string; color: string; point: Point }[];
  } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipIdRef = useRef(`plot-clip-${Math.random().toString(36).slice(2)}`);

  const prepared = useMemo(() => {
    return prepareSpectrumSeries(series.filter((item) => visible.has(item.id)), range, normalize);
  }, [normalize, range, series, visible]);
  const exportPrepared = useMemo(
    () => prepareSpectrumSeries(exportSeries ?? series, range, normalize),
    [exportSeries, normalize, range, series],
  );

  const chart = useMemo(() => {
    const allPoints = prepared.flatMap((item) => item.chartPoints);
    if (allPoints.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    }
    const xValues = allPoints.map((point) => point[0]);
    const yValues = allPoints.map((point) => point[1]);
    if (yDomain) {
      return {
        xMin: Math.min(...xValues),
        xMax: Math.max(...xValues),
        yMin: Math.min(...yDomain),
        yMax: Math.max(...yDomain),
      };
    }
    let yMin = Math.min(...yValues);
    let yMax = Math.max(...yValues);
    const yPadding = Math.max((yMax - yMin) * 0.08, Math.abs(yMax) * 0.015, 0.01);
    yMin -= yPadding;
    yMax += yPadding;
    if (typeof yMinFloor === "number") {
      yMin = Math.max(yMinFloor, yMin);
    }
    return {
      xMin: Math.min(...xValues),
      xMax: Math.max(...xValues),
      yMin,
      yMax,
    };
  }, [prepared, yDomain, yMinFloor]);

  const width = 1000;
  const height = 440;
  const margin = { top: 26, right: 26, bottom: 62, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xScale = (x: number) => {
    const ratio = (x - chart.xMin) / Math.max(chart.xMax - chart.xMin, 1e-9);
    return margin.left + (reverseX ? 1 - ratio : ratio) * plotWidth;
  };
  const yScale = (y: number) =>
    margin.top +
    (1 - (y - chart.yMin) / Math.max(chart.yMax - chart.yMin, 1e-9)) * plotHeight;
  const xTicks = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    return reverseX
      ? chart.xMax - ratio * (chart.xMax - chart.xMin)
      : chart.xMin + ratio * (chart.xMax - chart.xMin);
  });
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => chart.yMin + (index / 4) * (chart.yMax - chart.yMin),
  );
  const formatXTick = (value: number) => {
    if (xLabel.includes("um")) return value < 10 ? value.toFixed(2) : value.toFixed(1);
    return compact(value);
  };
  const formatYTick = (value: number) => {
    if (yDomain || yLabel.includes("%") || normalize) return value.toFixed(0);
    return compact(value);
  };

  const makePath = (points: Point[]) =>
    points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${xScale(x).toFixed(2)},${yScale(y).toFixed(2)}`)
      .join(" ");

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!frameRef.current || prepared.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - bounds.left) / bounds.width) * width;
    if (viewX < margin.left || viewX > width - margin.right) {
      setHover(null);
      return;
    }
    const ratio = (viewX - margin.left) / plotWidth;
    const dataX = reverseX
      ? chart.xMax - ratio * (chart.xMax - chart.xMin)
      : chart.xMin + ratio * (chart.xMax - chart.xMin);
    const frameBounds = frameRef.current.getBoundingClientRect();
    setHover({
      viewX,
      left: event.clientX - frameBounds.left,
      top: event.clientY - frameBounds.top,
      dataX,
      entries: prepared.map((item) => ({
        label: item.label,
        color: item.color,
        point: nearestPoint(item.chartPoints, dataX),
      })),
    });
  };

  return (
    <div className="chart-frame" ref={frameRef}>
      {prepared.length > 0 && (
        <div className="chart-export-actions" aria-label="Export current plot">
          <button
            type="button"
            onClick={() =>
              exportPlotData(
                exportPrepared,
                xLabel,
                normalize ? "Normalized intensity (%)" : yLabel,
                exportFileName ?? exportTitle ?? "spectra-chart",
                "csv",
                exportSections,
              )
            }
          >
            Origin CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportPlotData(
                exportPrepared,
                xLabel,
                normalize ? "Normalized intensity (%)" : yLabel,
                exportFileName ?? exportTitle ?? "spectra-chart",
                "txt",
                exportSections,
              )
            }
          >
            Origin TXT
          </button>
          <button
            type="button"
            onClick={() => {
              if (svgRef.current) {
                exportChartSvg(
                  svgRef.current,
                  exportTitle ?? xLabel,
                  exportFileName ?? exportTitle ?? "spectra-chart",
                  exportPresetId,
                );
              }
            }}
          >
            SVG
          </button>
          <button
            type="button"
            onClick={() => {
              if (svgRef.current) {
                void exportChartPng(
                  svgRef.current,
                  exportTitle ?? xLabel,
                  exportFileName ?? exportTitle ?? "spectra-chart",
                  exportPresetId,
                );
              }
            }}
          >
            PNG
          </button>
        </div>
      )}
      {prepared.length === 0 ? (
        <div className="chart-empty">Select at least one series to plot.</div>
      ) : (
        <svg
          ref={svgRef}
          className="spectrum-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${xLabel} vs ${normalize ? "Normalized intensity (%)" : yLabel} spectral plot`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
        >
          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            rx="0"
            ry="0"
            className="plot-surface"
          />
          <defs>
            <clipPath id={clipIdRef.current}>
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={yScale(tick)}
                y2={yScale(tick)}
                className="grid-line"
              />
              <text x={margin.left - 14} y={yScale(tick) + 4} textAnchor="end" className="axis-tick">
                {formatYTick(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line
                x1={xScale(tick)}
                x2={xScale(tick)}
                y1={height - margin.bottom}
                y2={height - margin.bottom + 7}
                className="tick-mark"
              />
              <text
                x={xScale(tick)}
                y={height - margin.bottom + 25}
                textAnchor="middle"
                className="axis-tick"
              >
                {formatXTick(tick)}
              </text>
            </g>
          ))}
          <text
            x={margin.left + plotWidth / 2}
            y={height - 12}
            textAnchor="middle"
            className="axis-label"
          >
            {xLabel}
          </text>
          <text
            x={17}
            y={margin.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 17 ${margin.top + plotHeight / 2})`}
            className="axis-label"
          >
            {normalize ? "Normalized intensity (%)" : yLabel}
          </text>
          <g clipPath={`url(#${clipIdRef.current})`}>
            {prepared.map((item) => (
              <path
                key={item.id}
                data-export-line="true"
                data-series-id={item.id}
                data-series-label={item.label}
                d={makePath(item.chartPoints)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.id === "measured" ? 1.7 : item.id === "fit" ? 2.6 : 2}
                strokeOpacity={item.id === "background" ? 0.7 : 0.94}
                strokeDasharray={item.id === "background" ? "7 6" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {hover && (
            <line
              x1={hover.viewX}
              x2={hover.viewX}
              y1={margin.top}
              y2={height - margin.bottom}
              className="hover-line"
            />
          )}
        </svg>
      )}
      {hover && (
        <div
          className={`chart-tooltip ${hover.left > (frameRef.current?.clientWidth ?? 0) * 0.66 ? "tooltip-left" : ""}`}
          style={{ left: hover.left, top: Math.max(hover.top, 66) }}
        >
          <div className="tooltip-x">{xLabel}: {xLabel.includes("um") ? fixed(hover.dataX, 2) : fixed(hover.dataX, 1)}</div>
          {hover.entries.slice(0, 7).map((entry) => (
            <div className="tooltip-row" key={entry.label}>
              <span className="tooltip-dot" style={{ background: entry.color }} />
              <span>{entry.label}</span>
              <strong>{compact(entry.point[1])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SpectralDashboard({
  data,
  currentUser,
  signOutPath,
  accessPassword,
}: {
  data: SpectralData;
  currentUser: { displayName: string; email: string };
  signOutPath: string;
  accessPassword?: string;
}) {
  const [technique, setTechnique] = useState<Technique>("raman");
  const [xpsRegion, setXpsRegion] = useState("mo3d");
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    () => new Set(data.raman.series.map((series) => series.id)),
  );
  const [rangeId, setRangeId] = useState("full");
  const [normalizeRaman, setNormalizeRaman] = useState(true);
  const [paletteId, setPaletteId] = useState<PaletteId>("xps-fixed");
  const [exportPresetId, setExportPresetId] = useState<ChartExportPresetId>("paper-single");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [databaseQuery, setDatabaseQuery] = useState("");
  const [databaseRecords, setDatabaseRecords] = useState<SpectralDatabaseRecord[]>([]);
  const [databaseStatus, setDatabaseStatus] = useState("Loading GitHub SQLite database...");
  const [databaseSeries, setDatabaseSeries] = useState<{
    technique: Technique;
    axis: { x: string; y: string };
    series: SpectrumSeries;
  } | null>(null);
  const [uploadTechnique, setUploadTechnique] = useState<UploadTechnique>("raman");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [uploadStatus, setUploadStatus] = useState("Choose a Raman or UV-VIS CSV/TXT file to preview.");
  const [advantagePreview, setAdvantagePreview] = useState<AdvantageXpsPreview | null>(null);
  const [advantageRegionId, setAdvantageRegionId] = useState("");
  const [advantageStatus, setAdvantageStatus] = useState("Choose an Avantage XPS Excel report (.xlsx/.xlsm) to plot locally.");
  const [githubToken, setGithubToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("spectra-github-token") ?? "";
  });

  const activeXpsRegion =
    data.xps.regions.find((region) => region.id === xpsRegion) ?? data.xps.regions[0];
  const baseActiveSeries =
    technique === "xps" ? activeXpsRegion.series : data[technique].series;
  const activeAxis = plotAxisLabels[technique];
  const rawActiveSeries = useMemo(() => {
    if (!databaseSeries || databaseSeries.technique !== technique) return baseActiveSeries;
    return [...baseActiveSeries, databaseSeries.series];
  }, [baseActiveSeries, databaseSeries, technique]);
  const activeSeries = useMemo(
    () => applyPalette(rawActiveSeries, paletteId, technique),
    [paletteId, rawActiveSeries, technique],
  );
  const completeExportSeries = useMemo(
    () => technique === "xps" ? buildXpsExportSeries(activeSeries) : activeSeries,
    [activeSeries, technique],
  );
  const completeExportSections = useMemo(
    () => technique === "xps" ? xpsExportSections(activeXpsRegion.label, data.xps) : [],
    [activeXpsRegion.label, data.xps, technique],
  );
  const activeAdvantageRegion = advantagePreview?.regions.find((region) => region.id === advantageRegionId)
    ?? advantagePreview?.regions[0];
  const advantageSeries = useMemo(
    () => activeAdvantageRegion ? applyPalette(activeAdvantageRegion.series, paletteId, "xps") : [],
    [activeAdvantageRegion, paletteId],
  );
  const advantageVisibleSeries = useMemo(
    () => new Set(advantageSeries.filter((series) => series.id !== "background").map((series) => series.id)),
    [advantageSeries],
  );
  const advantageExportSeries = useMemo(
    () => buildXpsExportSeries(advantageSeries),
    [advantageSeries],
  );
  const activeRange = plotRangeOptions[technique].find((option) => option.id === rangeId)?.range;
  const inventoryByName = Object.fromEntries(data.inventory.map((item) => [item.name, item]));

  useEffect(() => {
    const defaults =
      technique === "xps"
        ? rawActiveSeries
            .filter((series) => series.id !== "background")
            .map((series) => series.id)
        : rawActiveSeries.map((series) => series.id);
    setVisibleSeries(new Set(defaults));
    setRangeId("full");
  }, [rawActiveSeries, activeXpsRegion.id, technique]);

  useEffect(() => {
    let cancelled = false;
    openHostedDatabase()
      .then((db) => {
        if (cancelled) return;
        const records = rowsFromDatabase(db);
        db.close();
        setDatabaseRecords(records);
        setDatabaseStatus(`Loaded SQLite database: ${records.length} records.`);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(error);
        setDatabaseRecords([]);
        setDatabaseStatus("SQLite database is not available yet; it will be created after the first upload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTechnique = (next: Technique) => {
    setTechnique(next);
    document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleSeries = (id: string) => {
    setVisibleSeries((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parseUpload = async (file: File) => {
    setUploadStatus("Parsing file...");
    try {
      const rawText = await file.text();
      const digest = await sha256Hex(rawText);
      const preview = parseSpectrumText(
        rawText,
        uploadTechnique,
        file.name,
        uploadLabel,
        digest,
      );
      setUploadPreview(preview);
      setDatabaseSeries({
        technique: preview.technique,
        axis: preview.axis,
        series: preview.series,
      });
      setTechnique(preview.technique);
      setUploadStatus(
        `Parsed ${preview.series.pointCount?.toLocaleString("zh-CN")} points. Review the curve before writing it to the GitHub SQLite database.`,
      );
    } catch (error) {
      setUploadPreview(null);
      setUploadStatus(error instanceof Error ? error.message : "File parsing failed.");
    }
  };

  const parseAdvantageUpload = async (file: File) => {
    setAdvantageStatus("Reading Avantage Excel workbook locally...");
    try {
      const preview = await parseAdvantageXpsExcel(file);
      setAdvantagePreview(preview);
      setAdvantageRegionId(preview.regions[0]?.id ?? "");
      setTechnique("xps");
      setAdvantageStatus(
        `Parsed ${preview.regions.length} XPS region(s) from ${file.name}. No GitHub token is required for local plotting.`,
      );
    } catch (error) {
      setAdvantagePreview(null);
      setAdvantageRegionId("");
      setAdvantageStatus(error instanceof Error ? error.message : "Avantage Excel parsing failed.");
    }
  };

  const commitUploadToGithub = async () => {
    if (!uploadPreview) {
      setUploadStatus("Choose and parse a Raman or UV-VIS file first.");
      return;
    }
    if (!accessPassword) {
      setUploadStatus("No access password is available in this session, so encrypted upload is disabled.");
      return;
    }
    const token = githubToken.trim();
    if (!token) {
      setUploadStatus("Enter a GitHub fine-grained token with Contents: Read and Write permission.");
      return;
    }

    try {
      sessionStorage.setItem("spectra-github-token", token);
      setUploadStatus("Encrypting and writing to the SQLite database...");

      const SQL = await loadSqlJs();
      const currentDatabase = await fetchGithubDatabase(token);
      const db = currentDatabase.bytes
        ? new SQL.Database(currentDatabase.bytes)
        : new SQL.Database();
      createDatabaseSchema(db);
      const points = uploadPreview.series.points;
      const xValues = points.map((point) => point[0]);
      const yValues = points.map((point) => point[1]);
      const id = uploadPreview.series.id;
      const uploadedAt = new Date().toISOString();
      const encryptedRecord = await encryptJson(accessPassword, {
        schemaVersion: 1,
        id,
        technique: uploadPreview.technique,
        label: uploadPreview.series.label,
        axis: uploadPreview.axis,
        points,
        source: {
          fileName: uploadPreview.fileName,
          sha256: uploadPreview.sha256,
          originalText: uploadPreview.rawText,
        },
        uploadedAt,
      });

      const nextRecord: SpectralDatabaseRecord = {
        id,
        technique: uploadPreview.technique,
        label: uploadPreview.series.label,
        sourceFile: uploadPreview.fileName,
        uploadedAt,
        pointCount: uploadPreview.series.pointCount ?? points.length,
        xMin: Math.min(...xValues),
        xMax: Math.max(...xValues),
        yMin: Math.min(...yValues),
        yMax: Math.max(...yValues),
        sha256: uploadPreview.sha256,
        tags: [uploadPreview.technique, "web-upload"],
        encryptedRecord: JSON.stringify(encryptedRecord),
      };

      db.run("DELETE FROM spectra WHERE id = ?", [id]);
      db.run(
        `INSERT INTO spectra (
          id, technique, label, source_file, uploaded_at, point_count,
          x_min, x_max, y_min, y_max, sha256, tags, encrypted_record
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nextRecord.id,
          nextRecord.technique,
          nextRecord.label,
          nextRecord.sourceFile,
          nextRecord.uploadedAt,
          nextRecord.pointCount,
          nextRecord.xMin,
          nextRecord.xMax,
          nextRecord.yMin,
          nextRecord.yMax,
          nextRecord.sha256,
          JSON.stringify(nextRecord.tags ?? []),
          nextRecord.encryptedRecord,
        ],
      );
      db.run("PRAGMA user_version = 1");

      const exportedDatabase = db.export();
      const nextRows = rowsFromDatabase(db);
      db.close();

      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATABASE_PATH}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            branch: GITHUB_BRANCH,
            message: `Update SQLite spectral database for ${uploadPreview.series.label}`,
            content: bytesToBase64(exportedDatabase),
            sha: currentDatabase.sha,
          }),
        },
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`GitHub API ${response.status}: ${message.slice(0, 240)}`);
      }

      setDatabaseRecords(nextRows);
      setDatabaseStatus(`Wrote to SQLite database: ${nextRecord.label}`);
      setUploadStatus(`Upload complete: ${DATABASE_PATH}`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "GitHub write failed.");
    }
  };

  const loadDatabaseRecord = async (record: SpectralDatabaseRecord) => {
    if (
      !record.encryptedRecord ||
      !["raman", "uvvis", "ftir", "xps"].includes(record.technique)
    ) {
      setDatabaseStatus("This SQLite record is not a directly plottable spectrum record.");
      return;
    }
    if (!accessPassword) {
      setDatabaseStatus("No access password is available in this session, so the database record cannot be decrypted.");
      return;
    }
    try {
      setDatabaseStatus(`Decrypting ${record.label}...`);
      const stored = await decryptJson<{
        id: string;
        technique: Technique;
        label: string;
        axis: { x: string; y: string };
        points: Point[];
      }>(accessPassword, JSON.parse(record.encryptedRecord) as EncryptedPayload);
      const series: SpectrumSeries = {
        id: stored.id,
        label: stored.label,
        color: stored.technique === "raman" ? "#9ff2d7" : "#8ecbff",
        points: stored.points,
        pointCount: record.pointCount,
        sourcePath: `SQLite database - ${DATABASE_PATH}`,
      };
      setDatabaseSeries({ technique: stored.technique, axis: stored.axis, series });
      setTechnique(stored.technique);
      setDatabaseStatus(`Loaded and plotted: ${stored.label}`);
      document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setDatabaseStatus(error instanceof Error ? error.message : "SQLite record loading failed.");
    }
  };

  const filteredInventory = data.inventory.filter((item) => {
    const query = archiveQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      item.extensions.some((entry) => entry.extension.toLowerCase().includes(query))
    );
  });
  const filteredDatabaseRecords = databaseRecords.filter((record) => {
    const query = databaseQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      record.label,
      record.sourceFile,
      record.technique,
      DATABASE_PATH,
      ...(record.tags ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const featuredRaman = data.raman.series.find((series) => series.peaks)!;
  const featuredUvvis = data.uvvis.series.find((series) => series.metrics)!;
  const featuredXpsQuality = data.xps.fitQuality[0]!;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Back to top">
          <span className="brand-mark">SA</span>
          <span>
            <strong>Spectra Atlas</strong>
            <small>Materials characterization data hub</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#overview">Overview</a>
          <a href="#explorer">Spectra</a>
          <a href="#github-database">GitHub database</a>
          <a href="#xps-insights">Fit results</a>
          <a href="#archive">Archive</a>
        </nav>
        <span className="header-status">
          <i />
          <span className="signed-in-user">
            <b>{currentUser.displayName}</b>
            <small>{currentUser.email}</small>
          </span>
          <a className="signout-link" href={signOutPath}>
            Sign out
          </a>
        </span>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="kicker">
            MATERIALS CHARACTERIZATION - 2026
          </p>
          <h1>
            Turn scattered characterization data
            <br />
            <span>into comparable spectral evidence.</span>
          </h1>
          <p className="hero-lead">
            Raman, UV-VIS-NIR, FTIR, and XPS spectra are indexed, plotted,
            and kept traceable to the measurement archive.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={() => selectTechnique("raman")}>
              Open spectra workbench
              <span aria-hidden="true">↗</span>
            </button>
            <a className="secondary-action" href="#archive">
              View data archive
            </a>
          </div>
          <div className="hero-metrics" aria-label="Dataset summary">
            <div>
              <strong>{data.totals.files.toLocaleString("zh-CN")}</strong>
              <span>Indexed files</span>
            </div>
            <div>
              <strong>{data.totals.plottedSeries}</strong>
              <span>Plotted series</span>
            </div>
            <div>
              <strong>{data.totals.sizeMb} MB</strong>
              <span>Indexed data</span>
            </div>
          </div>
        </div>

        <div className="hero-panel" aria-label="Data composition">
          <div className="panel-head">
            <span>DATA COMPOSITION</span>
            <span className="live-pill">LIVE INDEX</span>
          </div>
          <div className="composition">
            <div className="composition-ring">
              <div>
                <strong>4</strong>
                <span>Core methods</span>
              </div>
            </div>
            <div className="composition-list">
              {(["raman", "xps", "uvvis", "ftir"] as Technique[]).map((item) => {
                const folder = item === "uvvis" ? "UV-VIS" : item === "ftir" ? "FT-IR" : techniqueInfo[item].name;
                const inventory = inventoryByName[folder];
                return (
                  <button key={item} type="button" onClick={() => selectTechnique(item)}>
                    <span className="legend-swatch" style={{ background: techniqueInfo[item].accent }} />
                    <span>
                      <b>{techniqueInfo[item].name}</b>
                      <small>{inventory?.files ?? 0} files</small>
                    </span>
                    <strong>{Math.round(((inventory?.files ?? 0) / data.totals.files) * 100)}%</strong>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="panel-foot">
            <span>Last indexed</span>
            <strong>{new Date(data.generatedAt).toLocaleDateString("zh-CN")}</strong>
          </div>
        </div>
      </section>

      <section className="overview section-shell" id="overview">
        <div className="section-heading">
          <div>
            <p className="kicker">01 - OVERVIEW</p>
            <h2>Four characterization methods, one evidence chain</h2>
          </div>
          <p>Structure, defects, optical response, chemical bonding, and surface states in one searchable workspace.</p>
        </div>
        <div className="technique-grid">
          {(["raman", "uvvis", "ftir", "xps"] as Technique[]).map((item, index) => {
            const info = techniqueInfo[item];
            const folder = item === "uvvis" ? "UV-VIS" : item === "ftir" ? "FT-IR" : info.name;
            const inventory = inventoryByName[folder];
            return (
              <button
                type="button"
                className="technique-card"
                key={item}
                onClick={() => selectTechnique(item)}
                style={{ "--accent": info.accent } as React.CSSProperties}
              >
                <span className="card-index">0{index + 1}</span>
                <span className="technique-code">{info.code}</span>
                <small>{info.eyebrow}</small>
                <h3>{info.name}</h3>
                <p>{info.caption}</p>
                <div className="technique-meta">
                  <span>{inventory?.files ?? 0} 鏂囦欢</span>
                  <span>{inventory?.sizeMb ?? 0} MB</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="explorer-section" id="explorer">
        <div className="section-shell">
          <div className="section-heading light">
            <div>
              <p className="kicker">02 - SPECTRA EXPLORER</p>
              <h2>Interactive spectra workbench</h2>
            </div>
            <p>Move the pointer to read values; click legend items to show or hide series.</p>
          </div>

          <div className="workbench">
            <div className="workbench-top">
              <div className="technique-tabs" role="tablist" aria-label="Select characterization technique">
                {(["raman", "uvvis", "ftir", "xps"] as Technique[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    role="tab"
                    aria-selected={technique === item}
                    className={technique === item ? "active" : ""}
                    onClick={() => setTechnique(item)}
                  >
                    <span style={{ background: techniqueInfo[item].accent }} />
                    {techniqueInfo[item].name}
                  </button>
                ))}
              </div>
              <div className="workbench-actions">
                {technique === "raman" && (
                  <label className="toggle-control">
                    <input
                      type="checkbox"
                      checked={normalizeRaman}
                      onChange={(event) => setNormalizeRaman(event.target.checked)}
                    />
                    <span />
                    Normalize
                  </label>
                )}
                <label className="select-control">
                  <span>Range</span>
                  <select value={rangeId} onChange={(event) => setRangeId(event.target.value)}>
                    {plotRangeOptions[technique].map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="select-control">
                  <span>Palette</span>
                  <select value={paletteId} onChange={(event) => setPaletteId(event.target.value as PaletteId)}>
                    {paletteOptions.map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="select-control">
                  <span>Export</span>
                  <select
                    value={exportPresetId}
                    onChange={(event) => setExportPresetId(event.target.value as ChartExportPresetId)}
                  >
                    {Object.entries(exportPresets).map(([id, preset]) => (
                      <option value={id} key={id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {technique === "xps" && (
              <div className="region-tabs">
                {data.xps.regions.map((region) => (
                  <button
                    type="button"
                    key={region.id}
                    className={xpsRegion === region.id ? "active" : ""}
                    onClick={() => setXpsRegion(region.id)}
                  >
                    {region.label}
                  </button>
                ))}
              </div>
            )}

            <div className="chart-title-row">
              <div>
                <span>{techniqueInfo[technique].eyebrow} SPECTRUM</span>
                <h3>
                  {technique === "xps"
                    ? `${data.xps.sample} · ${activeXpsRegion.label}`
                    : plotTitles[technique]}
                </h3>
              </div>
              <span className="chart-badge">
                {activeSeries.reduce((sum, series) => sum + (series.pointCount ?? series.points.length), 0).toLocaleString("zh-CN")}
                {" "}source points
              </span>
            </div>

            <SpectrumChart
              series={activeSeries}
              xLabel={activeAxis.x}
              yLabel={activeAxis.y}
              visible={visibleSeries}
              range={activeRange}
              reverseX={technique === "xps"}
              normalize={technique === "raman" && normalizeRaman}
              yDomain={technique === "ftir" || technique === "uvvis" ? [0, 100] : undefined}
              yMinFloor={technique === "xps" ? 0 : undefined}
              exportTitle={
                technique === "xps"
                  ? `${data.xps.sample} · ${activeXpsRegion.label}`
                  : plotTitles[technique]
              }
              exportFileName={
                technique === "xps"
                  ? `xps-${data.xps.sample}-${activeXpsRegion.id}`
                  : `${technique}-${rangeId}`
              }
              exportPresetId={exportPresetId}
              exportSeries={completeExportSeries}
              exportSections={completeExportSections}
            />

            <div className="series-legend" aria-label="Series legend">
              {activeSeries.map((series) => (
                <button
                  type="button"
                  key={series.id}
                  className={visibleSeries.has(series.id) ? "visible" : ""}
                  onClick={() => toggleSeries(series.id)}
                >
                  <span style={{ background: series.color }} />
                  {series.label}
                </button>
              ))}
            </div>

            <div className="chart-note">
              <span>i</span>
              {technique === "uvvis"
                ? "UV-VIS curves are displayed as transmittance versus wavelength. Use the CSV/TXT export to download the visible plotted data."
                : technique === "xps"
                  ? `Energy calibration: ${data.xps.chargeReference.line} -> ${data.xps.chargeReference.target_binding_energy_eV.toFixed(1)} eV; applied shift ${data.xps.chargeReference.applied_shift_eV.toFixed(3)} eV.`
                  : technique === "ftir"
                    ? "FTIR source data are converted from wavenumber to wavelength using wavelength (um) = 10000 / wavenumber (cm^-1), and displayed on a 0-100% transmittance axis."
                    : "Curves are sampled from the source files for interactive display; use the source data or the plotted CSV/TXT export for quantitative follow-up."}
            </div>
          </div>
        </div>
      </section>

      <section className="database-section section-shell" id="github-database">
        <div className="section-heading">
          <div>
            <p className="kicker">03 - GITHUB DATABASE</p>
            <h2>Upload, index, and reload spectra from one database</h2>
          </div>
          <p>
            Raman and UV-VIS files can be parsed in the browser, previewed as plots,
            and written to the searchable SQLite database in the GitHub repository.
          </p>
        </div>

        <div className="database-layout">
          <article className="upload-panel">
            <div className="database-card-head">
              <span>UPLOAD</span>
              <strong>Raman / UV-VIS</strong>
            </div>
            <div className="upload-grid">
              <label>
                <span>Data type</span>
                <select
                  value={uploadTechnique}
                  onChange={(event) => setUploadTechnique(event.target.value as UploadTechnique)}
                >
                  <option value="raman">Raman</option>
                  <option value="uvvis">UV-VIS</option>
                </select>
              </label>
              <label>
                <span>Sample / series name</span>
                <input
                  value={uploadLabel}
                  onChange={(event) => setUploadLabel(event.target.value)}
                  placeholder="e.g. MoS2-annealed-400s"
                />
              </label>
              <label className="file-drop">
                <span>Select CSV / TXT / DAT</span>
                <input
                  type="file"
                  accept=".csv,.txt,.dat,.tsv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void parseUpload(file);
                  }}
                />
              </label>
            </div>

            {uploadPreview && (
              <div className="upload-preview">
                <div className="upload-preview-head">
                  <span>{uploadPreview.technique.toUpperCase()}</span>
                  <strong>{uploadPreview.series.label}</strong>
                  <small>{uploadPreview.series.pointCount?.toLocaleString("zh-CN")} points</small>
                </div>
                <SpectrumChart
                  series={applyPalette([uploadPreview.series], paletteId, uploadPreview.technique)}
                  xLabel={uploadPreview.axis.x}
                  yLabel={uploadPreview.axis.y}
                  visible={new Set([uploadPreview.series.id])}
                  normalize={uploadPreview.technique === "raman"}
                  exportTitle={uploadPreview.series.label}
                  exportFileName={`upload-${uploadPreview.technique}-${uploadPreview.series.label}`}
                  exportPresetId={exportPresetId}
                />
              </div>
            )}

            <div className="github-token-box">
              <label>
                <span>GitHub write token</span>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder="fine-grained token - Contents: Read and Write"
                />
              </label>
              <button type="button" className="primary-action" onClick={commitUploadToGithub}>
                Encrypt and write to SQLite
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <p className="database-status">{uploadStatus}</p>
            <p className="database-footnote">
              GitHub Pages cannot reuse your browser login to write repository files.
              A fine-grained token is required only when committing uploaded records.
              Record payloads are encrypted with the current access password.
            </p>
          </article>

          <article className="upload-panel">
            <div className="database-card-head">
              <span>LOCAL PLOT</span>
              <strong>Avantage XPS Excel</strong>
            </div>
            <div className="upload-grid">
              <label className="file-drop">
                <span>Select Avantage Excel report</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls,.xml,.html,.htm"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void parseAdvantageUpload(file);
                  }}
                />
              </label>
            </div>

            {advantagePreview && activeAdvantageRegion && (
              <div className="upload-preview">
                <div className="upload-preview-head">
                  <span>XPS / AVANTAGE</span>
                  <strong>{activeAdvantageRegion.label}</strong>
                  <small>
                    {advantagePreview.regions.length} region(s) - {advantagePreview.fileName}
                  </small>
                </div>
                {advantagePreview.regions.length > 1 && (
                  <div className="region-tabs compact-tabs">
                    {advantagePreview.regions.map((region) => (
                      <button
                        type="button"
                        key={region.id}
                        className={activeAdvantageRegion.id === region.id ? "active" : ""}
                        onClick={() => setAdvantageRegionId(region.id)}
                      >
                        {region.label}
                      </button>
                    ))}
                  </div>
                )}
                <SpectrumChart
                  series={advantageSeries}
                  xLabel={plotAxisLabels.xps.x}
                  yLabel={plotAxisLabels.xps.y}
                  visible={advantageVisibleSeries}
                  reverseX
                  yMinFloor={0}
                  exportTitle={`Avantage ${activeAdvantageRegion.label}`}
                  exportFileName={`advantage-xps-${activeAdvantageRegion.label}`}
                  exportPresetId={exportPresetId}
                  exportSeries={advantageExportSeries}
                  exportSections={advantagePreview.exportSections}
                />
                <p className="database-footnote">
                  Local-only parsing: measured, total fit, background, and fitted peak columns are read from the workbook in your browser.
                  Nothing is written to GitHub and no token is used.
                </p>
              </div>
            )}

            <p className="database-status">{advantageStatus}</p>
            <p className="database-footnote">
              Supported best: Avantage .xlsx/.xlsm reports with scan sheets such as O1s Scan, Mo3d Scan, XPS Survey, and Peak Table.
              Legacy binary .xls may need to be re-saved as .xlsx.
            </p>
          </article>

          <article className="index-panel">
            <div className="database-card-head">
              <span>INDEX</span>
              <strong>{databaseRecords.length} records</strong>
            </div>
            <label className="database-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={databaseQuery}
                onChange={(event) => setDatabaseQuery(event.target.value)}
                placeholder="Search sample, file name, Raman, UV-VIS, or tags"
              />
            </label>
            <p className="database-status">{databaseStatus}</p>
            <div className="database-records">
              {filteredDatabaseRecords.map((record) => (
                <div className="database-record" key={record.id}>
                  <span>{record.technique.toUpperCase()}</span>
                  <div>
                    <strong>{record.label}</strong>
                    <small>{record.sourceFile}</small>
                    <small>
                      {record.pointCount.toLocaleString("zh-CN")} points -{" "}
                      {record.uploadedAt.slice(0, 10)}
                    </small>
                    {record.xMin !== undefined && record.xMax !== undefined && (
                      <small>
                        X {fixed(record.xMin, 2)} to {fixed(record.xMax, 2)}
                      </small>
                    )}
                  </div>
                  <button type="button" onClick={() => void loadDatabaseRecord(record)}>
                    Load plot
                  </button>
                </div>
              ))}
              {filteredDatabaseRecords.length === 0 && (
                <div className="database-empty">No matching database records.</div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="insights section-shell" id="xps-insights">
        <div className="section-heading">
          <div>
            <p className="kicker">04 - SIGNALS & FITS</p>
            <h2>Key readings and fitted parameters</h2>
          </div>
          <p>Peak positions, transmittance readings, and fitting quality are summarized from the plotted spectra.</p>
        </div>
        <div className="insight-grid">
          <article className="insight-card wide">
            <div className="insight-head">
              <span className="mini-code raman-code">RA</span>
              <div>
                <small>RAMAN - {featuredRaman.label}</small>
                <h3>Peak overview</h3>
              </div>
              <strong className="confidence">SOURCE DATA</strong>
            </div>
            <div className="peak-strip">
              {[
                ["D band", featuredRaman.peaks!.d[0], "cm^-1"],
                ["G band", featuredRaman.peaks!.g[0], "cm^-1"],
                ["2D band", featuredRaman.peaks!.twoD[0], "cm^-1"],
              ].map(([label, value, unit]) => (
                <div key={label as string}>
                  <span>{label}</span>
                  <strong>{fixed(value as number, 1)}</strong>
                  <small>{unit}</small>
                </div>
              ))}
            </div>
            <p>
              {featuredRaman.label} is summarized by D, G, and 2D peak windows for quick cross-sample comparison.
            </p>
          </article>

          <article className="insight-card">
            <div className="insight-head">
              <span className="mini-code uv-code">UV</span>
              <div>
                <small>UV-VIS-NIR - {featuredUvvis.label}</small>
                <h3>Relative transmittance</h3>
              </div>
            </div>
            <div className="big-reading">
              <strong>{fixed(featuredUvvis.metrics!.t1500, 1)}%</strong>
              <span>@ 1500 nm</span>
            </div>
            <div className="mini-bars">
              {[
                ["550", featuredUvvis.metrics!.t550],
                ["800", featuredUvvis.metrics!.t800],
                ["1000", featuredUvvis.metrics!.t1000],
                ["1500", featuredUvvis.metrics!.t1500],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <span>{label} nm</span>
                  <i>
                    <b style={{ width: `${Math.min(value as number, 100)}%` }} />
                  </i>
                  <strong>{fixed(value as number, 1)}%</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="insight-card">
            <div className="insight-head">
              <span className="mini-code xps-code">XP</span>
              <div>
                <small>XPS - {featuredXpsQuality.region}</small>
                <h3>Fit quality</h3>
              </div>
            </div>
            <div className="big-reading">
              <strong>{featuredXpsQuality.rSquared.toFixed(5)}</strong>
              <span>R^2</span>
            </div>
            <div className="fit-quality-list">
              {data.xps.fitQuality.map((item) => (
                <div key={item.region}>
                  <span>{item.region}</span>
                  <strong>{item.rSquared.toFixed(4)}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="chemistry-table">
          <div className="table-heading">
            <div>
              <small>{data.xps.sample} - CHEMICAL STATES</small>
              <h3>XPS peak-fitting parameters</h3>
            </div>
            <span>{data.xps.sampleDate}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Chemical state / component</th>
                  <th>Binding energy (eV)</th>
                  <th>FWHM (eV)</th>
                  <th>Area (%)</th>
                </tr>
              </thead>
              <tbody>
                {data.xps.fitResults
                  .filter((row) => row.fraction !== null)
                  .slice(0, 14)
                  .map((row, index) => (
                    <tr key={`${row.region}-${row.state}-${index}`}>
                      <td>{row.region}</td>
                      <td>{row.state}</td>
                      <td>{fixed(row.energy, 3)}</td>
                      <td>{fixed(row.fwhm, 3)}</td>
                      <td>
                        <span className="fraction-cell">
                          <i>
                            <b style={{ width: `${Math.min(row.fraction, 100)}%` }} />
                          </i>
                          {fixed(row.fraction, 2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="caveat">
            <strong>Analysis boundary</strong>
            <span>
              The N 1s high-resolution window ends near 410 eV and does not cover the
              Mo 3p region around 412-416 eV, so N component assignments should be treated as provisional.
            </span>
          </div>
        </div>
      </section>

      <section className="archive-section" id="archive">
        <div className="section-shell">
          <div className="section-heading light">
            <div>
              <p className="kicker">05 - DATA ARCHIVE</p>
              <h2>What is available in the measurement directory</h2>
            </div>
            <label className="archive-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={archiveQuery}
                onChange={(event) => setArchiveQuery(event.target.value)}
                placeholder="Search technique or extension, e.g. CSV"
                aria-label="Search data archive"
              />
            </label>
          </div>
          <div className="archive-grid">
            {filteredInventory.map((item) => (
              <article key={item.name}>
                <div className="archive-card-head">
                  <span>{item.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <small>Updated {item.newest}</small>
                  </div>
                  <strong>{item.files}</strong>
                </div>
                <div className="archive-stats">
                  <span>{item.sizeMb} MB</span>
                  <span>{item.extensions.length} main formats</span>
                </div>
                <div className="format-list">
                  {item.extensions.map((entry) => (
                    <span key={entry.extension}>
                      {entry.extension}
                      <b>{entry.count}</b>
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="provenance">
            <div>
              <strong>Data source</strong>
              <span>Local measurement archive; raw files are not uploaded here.</span>
            </div>
            <div>
              <strong>Display strategy</strong>
              <span>Read-only parsing - peak-preserving sampling - source files remain unchanged.</span>
            </div>
            <div>
              <strong>Version record</strong>
              <span>Git main - file index updates with each data generation run.</span>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="section-shell footer-inner">
          <div className="brand footer-brand">
            <span className="brand-mark">SA</span>
            <span>
              <strong>Spectra Atlas</strong>
              <small>Materials Characterization</small>
            </span>
          </div>
          <p>Built for browsing, comparing, exporting, and reviewing experimental spectra.</p>
          <a href="#top">Back to top ↗</a>
        </div>
      </footer>
    </main>
  );
}
