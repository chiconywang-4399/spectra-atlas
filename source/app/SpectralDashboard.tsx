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

const techniqueInfo: Record<
  Technique,
  { eyebrow: string; name: string; caption: string; accent: string; code: string }
> = {
  raman: {
    eyebrow: "VIBRATIONAL",
    name: "Raman",
    caption: "晶格振动、D / G / 2D 峰与缺陷信息",
    accent: "#63e6be",
    code: "RA",
  },
  uvvis: {
    eyebrow: "OPTICAL",
    name: "UV–VIS–NIR",
    caption: "300–1690 nm 相对透射与波段比较",
    accent: "#4dabf7",
    code: "UV",
  },
  ftir: {
    eyebrow: "VIBRATIONAL",
    name: "FTIR",
    caption: "2.5–16.7 µm 中红外透射光谱",
    accent: "#ffb86b",
    code: "IR",
  },
  xps: {
    eyebrow: "SURFACE",
    name: "XPS",
    caption: "Mo-10 高分辨分峰、拟合与化学态",
    accent: "#c77dff",
    code: "XP",
  },
};

const rangeOptions: Record<Technique, { id: string; label: string; range?: [number, number] }[]> = {
  raman: [
    { id: "full", label: "完整光谱" },
    { id: "dg", label: "D / G 峰", range: [1200, 1700] },
    { id: "2d", label: "2D 区", range: [2400, 2900] },
  ],
  uvvis: [
    { id: "full", label: "全波段" },
    { id: "vis", label: "可见光", range: [400, 780] },
    { id: "nir", label: "近红外", range: [780, 1690] },
  ],
  ftir: [
    { id: "full", label: "完整光谱" },
    { id: "functional", label: "官能团区 · 2.5–6.7 µm", range: [2.5, 6.7] },
    { id: "fingerprint", label: "指纹区 · 6.7–16.7 µm", range: [6.7, 16.7] },
  ],
  xps: [{ id: "full", label: "当前谱区" }],
};

const compact = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (absolute >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (absolute >= 100) return value.toFixed(0);
  if (absolute >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

const fixed = (value: number, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : "—";

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

function SpectrumChart({
  series,
  xLabel,
  yLabel,
  visible,
  range,
  reverseX,
  normalize,
  yDomain,
}: {
  series: SpectrumSeries[];
  xLabel: string;
  yLabel: string;
  visible: Set<string>;
  range?: [number, number];
  reverseX?: boolean;
  normalize?: boolean;
  yDomain?: [number, number];
}) {
  const [hover, setHover] = useState<{
    viewX: number;
    left: number;
    top: number;
    dataX: number;
    entries: { label: string; color: string; point: Point }[];
  } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const prepared = useMemo(() => {
    return series
      .filter((item) => visible.has(item.id))
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
  }, [normalize, range, series, visible]);

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
    return {
      xMin: Math.min(...xValues),
      xMax: Math.max(...xValues),
      yMin,
      yMax,
    };
  }, [prepared, yDomain]);

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
    if (xLabel.includes("µm")) return value < 10 ? value.toFixed(2) : value.toFixed(1);
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
      {prepared.length === 0 ? (
        <div className="chart-empty">选择至少一条曲线以继续比较</div>
      ) : (
        <svg
          className="spectrum-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${xLabel} 与 ${normalize ? "Normalized intensity (%)" : yLabel} 光谱图`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
        >
          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            rx="8"
            className="plot-surface"
          />
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
          {prepared.map((item) => (
            <path
              key={item.id}
              d={makePath(item.chartPoints)}
              fill="none"
              stroke={item.color}
              strokeWidth={item.id === "measured" ? 1.7 : item.id === "fit" ? 2.6 : 2}
              strokeOpacity={item.id === "background" ? 0.7 : 0.94}
              strokeDasharray={item.id === "background" ? "7 6" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
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
          <div className="tooltip-x">{xLabel}: {xLabel.includes("µm") ? fixed(hover.dataX, 2) : fixed(hover.dataX, 1)}</div>
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
}: {
  data: SpectralData;
  currentUser: { displayName: string; email: string };
  signOutPath: string;
}) {
  const [technique, setTechnique] = useState<Technique>("raman");
  const [xpsRegion, setXpsRegion] = useState("mo3d");
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    () => new Set(data.raman.series.map((series) => series.id)),
  );
  const [rangeId, setRangeId] = useState("full");
  const [normalizeRaman, setNormalizeRaman] = useState(true);
  const [archiveQuery, setArchiveQuery] = useState("");

  const activeXpsRegion =
    data.xps.regions.find((region) => region.id === xpsRegion) ?? data.xps.regions[0];
  const activeSeries =
    technique === "xps" ? activeXpsRegion.series : data[technique].series;
  const activeAxis = technique === "xps" ? data.xps.axis : data[technique].axis;
  const activeRange = rangeOptions[technique].find((option) => option.id === rangeId)?.range;
  const inventoryByName = Object.fromEntries(data.inventory.map((item) => [item.name, item]));

  useEffect(() => {
    const defaults =
      technique === "xps"
        ? activeSeries
            .filter((series) => series.id !== "background")
            .map((series) => series.id)
        : activeSeries.map((series) => series.id);
    setVisibleSeries(new Set(defaults));
    setRangeId("full");
  }, [activeXpsRegion.id, technique]);

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

  const filteredInventory = data.inventory.filter((item) => {
    const query = archiveQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      item.extensions.some((entry) => entry.extension.toLowerCase().includes(query))
    );
  });

  const featuredRaman = data.raman.series.find((series) => series.peaks)!;
  const featuredUvvis = data.uvvis.series.find((series) => series.metrics)!;
  const featuredXpsQuality = data.xps.fitQuality[0]!;

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="返回顶部">
          <span className="brand-mark">SA</span>
          <span>
            <strong>Spectra Atlas</strong>
            <small>材料表征数据中枢</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#overview">总览</a>
          <a href="#explorer">光谱对比</a>
          <a href="#xps-insights">拟合结果</a>
          <a href="#archive">数据档案</a>
        </nav>
        <span className="header-status">
          <i />
          <span className="signed-in-user">
            <b>{currentUser.displayName}</b>
            <small>{currentUser.email}</small>
          </span>
          <a className="signout-link" href={signOutPath}>
            退出
          </a>
        </span>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="kicker">
            MATERIALS CHARACTERIZATION · 2026
          </p>
          <h1>
            把分散的表征数据，
            <br />
            <span>变成可比较的证据。</span>
          </h1>
          <p className="hero-lead">
            汇总 Raman、UV–VIS、FTIR 与 XPS 原始光谱、处理结果和拟合参数。
            每条展示曲线都可回溯到“量测”目录中的真实文件。
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={() => selectTechnique("raman")}>
              进入光谱工作台
              <span aria-hidden="true">↗</span>
            </button>
            <a className="secondary-action" href="#archive">
              查看数据清单
            </a>
          </div>
          <div className="hero-metrics" aria-label="数据集摘要">
            <div>
              <strong>{data.totals.files.toLocaleString("zh-CN")}</strong>
              <span>表征文件</span>
            </div>
            <div>
              <strong>{data.totals.plottedSeries}</strong>
              <span>可视化曲线</span>
            </div>
            <div>
              <strong>{data.totals.sizeMb} MB</strong>
              <span>已索引数据</span>
            </div>
          </div>
        </div>

        <div className="hero-panel" aria-label="数据构成">
          <div className="panel-head">
            <span>DATA COMPOSITION</span>
            <span className="live-pill">LIVE INDEX</span>
          </div>
          <div className="composition">
            <div className="composition-ring">
              <div>
                <strong>4</strong>
                <span>核心表征</span>
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
            <span>最后索引</span>
            <strong>{new Date(data.generatedAt).toLocaleDateString("zh-CN")}</strong>
          </div>
        </div>
      </section>

      <section className="overview section-shell" id="overview">
        <div className="section-heading">
          <div>
            <p className="kicker">01 · OVERVIEW</p>
            <h2>四种表征，同一条证据链</h2>
          </div>
          <p>从结构和缺陷，到光学响应、化学键与表面价态。</p>
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
                  <span>{inventory?.files ?? 0} 文件</span>
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
              <p className="kicker">02 · SPECTRA EXPLORER</p>
              <h2>交互式光谱工作台</h2>
            </div>
            <p>移动指针读取数值；点击图例叠加或隐藏曲线。</p>
          </div>

          <div className="workbench">
            <div className="workbench-top">
              <div className="technique-tabs" role="tablist" aria-label="选择表征类型">
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
                    归一化
                  </label>
                )}
                <label className="select-control">
                  <span>观察窗口</span>
                  <select value={rangeId} onChange={(event) => setRangeId(event.target.value)}>
                    {rangeOptions[technique].map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.label}
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
                    : `${techniqueInfo[technique].name} 样品对比`}
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
              yDomain={technique === "ftir" ? [0, 100] : undefined}
            />

            <div className="series-legend" aria-label="曲线图例">
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
              <span>ⓘ</span>
              {technique === "uvvis"
                ? data.uvvis.note
                : technique === "xps"
                  ? `能量校准：${data.xps.chargeReference.line} → ${data.xps.chargeReference.target_binding_energy_eV.toFixed(1)} eV；应用位移 ${data.xps.chargeReference.applied_shift_eV.toFixed(3)} eV。`
                  : technique === "ftir"
                    ? "FTIR 原始数据为波数 cm⁻¹；页面按 λ(µm)=10000/波数 转换为波长坐标，并以 0–100% 透过率范围显示。"
                    : "曲线由目录内原始文件解析并抽样显示；抽样保留峰形，定量分析仍以源文件为准。"}
            </div>
          </div>
        </div>
      </section>

      <section className="insights section-shell" id="xps-insights">
        <div className="section-heading">
          <div>
            <p className="kicker">03 · SIGNALS & FITS</p>
            <h2>关键读数，一眼定位</h2>
          </div>
          <p>将峰位、透射率与拟合质量从曲线中提取出来。</p>
        </div>
        <div className="insight-grid">
          <article className="insight-card wide">
            <div className="insight-head">
              <span className="mini-code raman-code">RA</span>
              <div>
                <small>RAMAN · {featuredRaman.label}</small>
                <h3>峰位概览</h3>
              </div>
              <strong className="confidence">SOURCE DATA</strong>
            </div>
            <div className="peak-strip">
              {[
                ["D 区", featuredRaman.peaks!.d[0], "cm⁻¹"],
                ["G 峰", featuredRaman.peaks!.g[0], "cm⁻¹"],
                ["2D 区", featuredRaman.peaks!.twoD[0], "cm⁻¹"],
              ].map(([label, value, unit]) => (
                <div key={label as string}>
                  <span>{label}</span>
                  <strong>{fixed(value as number, 1)}</strong>
                  <small>{unit}</small>
                </div>
              ))}
            </div>
            <p>
              {featuredRaman.label} 的主强峰位于 G
              区附近；D、G 与 2D 窗口用于跨样品快速对比。
            </p>
          </article>

          <article className="insight-card">
            <div className="insight-head">
              <span className="mini-code uv-code">UV</span>
              <div>
                <small>UV–VIS–NIR · {featuredUvvis.label}</small>
                <h3>相对透射</h3>
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
                <small>XPS · {featuredXpsQuality.region}</small>
                <h3>拟合质量</h3>
              </div>
            </div>
            <div className="big-reading">
              <strong>{featuredXpsQuality.rSquared.toFixed(5)}</strong>
              <span>R²</span>
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
              <small>{data.xps.sample} · CHEMICAL STATES</small>
              <h3>XPS 分峰参数</h3>
            </div>
            <span>{data.xps.sampleDate}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>谱区</th>
                  <th>化学态 / 组分</th>
                  <th>峰位 (eV)</th>
                  <th>FWHM (eV)</th>
                  <th>面积占比</th>
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
            <strong>分析边界</strong>
            <span>
              N 1s 高分辨窗口止于约 410 eV，未覆盖约 412–416 eV 的 Mo 3p₁/₂；
              因此 N 组分属于暂定结果。
            </span>
          </div>
        </div>
      </section>

      <section className="archive-section" id="archive">
        <div className="section-shell">
          <div className="section-heading light">
            <div>
              <p className="kicker">04 · DATA ARCHIVE</p>
              <h2>目录里实际有什么</h2>
            </div>
            <label className="archive-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={archiveQuery}
                onChange={(event) => setArchiveQuery(event.target.value)}
                placeholder="搜索技术或扩展名，例如 CSV"
                aria-label="搜索数据目录"
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
                    <small>更新于 {item.newest}</small>
                  </div>
                  <strong>{item.files}</strong>
                </div>
                <div className="archive-stats">
                  <span>{item.sizeMb} MB</span>
                  <span>{item.extensions.length} 种主要格式</span>
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
              <strong>数据来源</strong>
              <span>本地量测归档（原始文件未上传）</span>
            </div>
            <div>
              <strong>展示策略</strong>
              <span>只读解析 · 峰形保留抽样 · 源文件不改写</span>
            </div>
            <div>
              <strong>版本记录</strong>
              <span>Git main · 文件清单随生成时间更新</span>
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
          <p>为实验数据浏览、比较与结果复核而构建。</p>
          <a href="#top">返回顶部 ↑</a>
        </div>
      </footer>
    </main>
  );
}
