# Spectra Atlas

Raman、UV–VIS、FTIR 与 XPS 实验数据的加密可视化网站。

- 网站地址：<https://chiconywang-4399.github.io/spectra-atlas/>
- 发布方式：GitHub Pages
- 数据保护：PBKDF2-SHA256（600,000 次迭代）派生密钥，AES-256-GCM 加密
- 解密方式：仅在访问者浏览器内完成；访问密码不存放在仓库中

## 仓库结构

- `index.html`、`assets/`、`spectral-data.enc.json`：GitHub Pages 发布文件
- `source/`：网站源代码、构建脚本和测试
- 原始实验数据与明文处理数据：不上传 GitHub，仅保留在数据工作目录

## 安全说明

GitHub Pages 仓库是公开的，但实验数据只以加密形式存在。不要把访问密码、
明文 `spectral-data.json`、原始仪器导出或文件级清单提交到本仓库。
