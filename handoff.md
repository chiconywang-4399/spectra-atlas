# Spectra Atlas handoff

## Site

- Production URL: https://chiconywang-4399.github.io/spectra-atlas/
- GitHub repository: `chiconywang-4399/spectra-atlas`
- Local repo used by Codex: `D:\CodexHome\visualizations\2026\07\24\019f925a-c017-7461-97e0-97320cfe138b\spectra-atlas-git`
- Raw and processed measurement data root: `D:\OneDrive - shanghaitech.edu.cn\量测`
- Local/GitHub Pages password: `244948@Wang`

## Current data model

- Static encrypted payload: `spectral-data.enc.json`
- Main open database file: `data/spectra.sqlite`
- Source generator: `source/scripts/generate-spectral-data.mjs`
- SQLite generator: `source/scripts/create-spectral-sqlite.mjs`
- GitHub Pages builder: `source/scripts/build-github-pages.mjs`
- GitHub Pages verifier: `source/scripts/verify-github-pages.mjs`

## Important plotting requirements

- Plot labels and exported figure text should be English to avoid Chinese font/encoding issues.
- Raman x-axis is Raman shift in `cm^-1`, not thousands/k units.
- UV-VIS-NIR and FTIR y-axis is constrained to `0-100%`.
- XPS x-axis is binding energy in `eV` and is plotted in reverse direction.
- Exported figures use square plot frames, not rounded corners.
- CSV/TXT exports are Origin-friendly wide `X/Y` paired columns with Long Name, Units, X/Y designation, and Comments rows.

## Avantage XPS Excel import

The dashboard now has a local-only `Avantage XPS Excel` import panel. It accepts `.xlsx`, `.xlsm`, XML workbook, and HTML table exports. Legacy binary `.xls` cannot be parsed inside the browser and should be re-saved from Avantage/Excel as `.xlsx`.

Expected Avantage-processed scan sheets:

- scan sheet names such as `O1s Scan`, `N1s Scan`, `C1s Scan`, `Mo3d Scan`, `XPS Survey`
- header row containing `Binding Energy (E)` or `Kinetic Energy`
- measured intensity column with `Counts / s`
- optional `Fitted envelope`
- optional fitted components named like `Fitted Peak ...`
- optional `Backgnd.` / `Background` / `Shirley`
- optional `Peak Table` sheet with fitted peak metadata

The browser parser reads the workbook directly on the user's computer using ZIP/XML parsing and `DecompressionStream`; no GitHub token is required, and uploads are not written to GitHub unless a future workflow explicitly adds that capability.

## Last validation used

From `source`:

1. Generate encrypted data and SQLite database with `SPECTRA_DATA_ROOT` and `SPECTRA_GITHUB_PAGES_PASSWORD`.
2. Build GitHub Pages with `scripts/build-github-pages.mjs`.
3. Verify with `scripts/verify-github-pages.mjs`.
4. Run targeted regression tests:
   - `CSV and TXT exports use Origin-friendly wide XY columns`
   - `XPS export includes deconvolution, background-corrected, residual, and fit metadata`
   - `Avantage XPS Excel import is local-only and keeps fitted peak data exportable`

Sample Avantage workbook checked locally:

- `D:\OneDrive - shanghaitech.edu.cn\量测\XPS\20260708\2\xps2.xlsx`
- It contains O1s/N1s/C1s/Mo3d scan sheets with measured, fitted envelope, Shirley/background, and fitted peak components; XPS Survey has measured survey data only; `Peak Table` exists.
