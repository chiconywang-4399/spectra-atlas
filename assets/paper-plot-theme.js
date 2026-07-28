const THEME_KEY = "spectra-atlas-theme";

const palettes = {
  raman: ["#000000", "#D55E00", "#0072B2", "#009E73", "#CC79A7", "#E69F00", "#56B4E9"],
  uvvis: ["#0072B2", "#009E73", "#D55E00", "#CC79A7", "#E69F00", "#000000"],
  ftir: ["#E69F00", "#0072B2", "#009E73", "#D55E00", "#CC79A7", "#000000"],
  xps: ["#000000", "#D55E00", "#0072B2", "#009E73", "#CC79A7", "#E69F00", "#56B4E9"],
};

const techniqueAccents = {
  raman: "#009E73",
  uvvis: "#0072B2",
  ftir: "#E69F00",
  xps: "#CC79A7",
};

function currentTechnique() {
  const active = document.querySelector(".technique-tabs button.active");
  const label = active?.textContent?.toLowerCase() || "";
  if (label.includes("uv")) return "uvvis";
  if (label.includes("ftir")) return "ftir";
  if (label.includes("xps")) return "xps";
  return "raman";
}

function fullNumber(label) {
  const text = String(label || "").trim();
  const match = text.match(/^(-?\d+(?:\.\d+)?)k$/i);
  if (!match) return text;
  return String(Math.round(Number(match[1]) * 1000));
}

function ensureShell() {
  const main = document.querySelector("main:not(.gh-gate-shell)");
  if (!main) return null;
  main.classList.add("dashboard-shell");
  if (!main.dataset.theme) {
    main.dataset.theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  }
  return main;
}

function setTheme(theme) {
  const main = ensureShell();
  if (!main) return;
  main.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll(".theme-switch button").forEach((button) => {
    const active = button.dataset.themeChoice === theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function addPaletteControl() {
  const status = document.querySelector(".site-header .header-status");
  if (!status || status.querySelector(".theme-palette")) return;

  const palette = document.createElement("span");
  palette.className = "theme-palette";
  palette.setAttribute("aria-label", "Palette");
  palette.innerHTML = `
    <span class="palette-swatches" aria-hidden="true">
      ${palettes.raman.slice(0, 5).map((color) => `<i style="background:${color}"></i>`).join("")}
    </span>
    <span class="theme-switch" role="group" aria-label="Color mode">
      <button type="button" data-theme-choice="light">Light</button>
      <button type="button" data-theme-choice="dark">Dark</button>
    </span>
  `;

  palette.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
  });
  status.prepend(palette);
  setTheme(ensureShell()?.dataset.theme || "light");
}

function applyPlotStyle() {
  const technique = currentTechnique();

  document.querySelectorAll(".spectrum-chart").forEach((svg) => {
    svg.querySelectorAll(".axis-tick").forEach((tick) => {
      const y = Number(tick.getAttribute("y") || 0);
      if (y > 380) tick.textContent = fullNumber(tick.textContent);
    });
  });

  document.querySelectorAll(".technique-tabs button").forEach((button) => {
    const text = button.textContent.toLowerCase();
    const key = text.includes("uv") ? "uvvis" : text.includes("ftir") ? "ftir" : text.includes("xps") ? "xps" : "raman";
    const swatch = button.querySelector("span");
    if (swatch) swatch.style.background = techniqueAccents[key];
  });
}

function patchDashboard() {
  if (!ensureShell()) return;
  addPaletteControl();
  applyPlotStyle();
}

let scheduled = false;
function schedulePatch() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    patchDashboard();
  });
}

document.addEventListener("DOMContentLoaded", schedulePatch);
window.addEventListener("load", schedulePatch);
new MutationObserver(schedulePatch).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
schedulePatch();
