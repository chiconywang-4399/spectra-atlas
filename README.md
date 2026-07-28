# Spectra Atlas

Raman、UV–VIS、FTIR 与 XPS 实验数据的加密可视化网站。

- 网站地址：<https://chiconywang-4399.github.io/spectra-atlas/>
- 发布方式：GitHub Pages
- 数据保护：PBKDF2-SHA256（600,000 次迭代）派生密钥，AES-256-GCM 加密
- 解密方式：仅在访问者浏览器内完成；访问密码不存放在仓库中

## 仓库结构

- `index.html`、`assets/`、`spectral-data.enc.json`：GitHub Pages 发布文件
- `data/spectra.sqlite`：主流 SQLite 数据库，索引并保存已发布光谱记录
- `source/`：网站源代码、构建脚本和测试
- 明文处理数据：不上传 GitHub，仅保留在数据工作目录；发布数据以加密形式托管

## 安全说明

GitHub Pages 仓库是公开的，但实验数据只以加密形式存在。不要把访问密码或
明文 `spectral-data.json` 提交到本仓库。

## SQLite 数据库与网页上传

- 数据库文件：`data/spectra.sqlite`
- 表：`spectra`
- 覆盖：当前发布的 Raman、UV–VIS、FTIR、XPS 展示曲线，以及网页上传的新 Raman / UV–VIS 数据
- 网页上传：选择 CSV/TXT/DAT 后先在浏览器内解析并绘图，确认后写入 SQLite
- GitHub 写入：由于 GitHub Pages 是静态站点，上传提交需要用户提供 fine-grained GitHub token，权限至少为本仓库 `Contents: Read and Write`
- 数据保护：SQLite 中的曲线记录使用站点访问密码加密；搜索索引只保存样品名、技术类型、文件名、点数、范围等元数据
