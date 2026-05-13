# html2png

将本地 HTML 文件导出为高清 PNG，适合打印物料（易拉宝、海报、名片等）。

## 安装

```bash
# 1. 克隆仓库
git clone https://github.com/lux-2501/html2png.git
cd html2png

# 2. 安装依赖
npm install

# 3. 安装无头浏览器（仅首次，需联网，约 200MB）
npx puppeteer browsers install chrome-headless-shell

# 4. （可选）设置全局命令，让任何目录都能用 html2png
echo '#!/bin/bash' > /usr/local/bin/html2png
echo "exec node \"$(pwd)/html2png.js\" \"\$@\"" >> /usr/local/bin/html2png
chmod +x /usr/local/bin/html2png
```

> **离线安装**：如果网络无法访问 storage.googleapis.com，可将已有的 `chrome-headless-shell` 二进制文件手动放到 `~/.cache/puppeteer/chrome-headless-shell/<platform>/` 目录，脚本会自动找到它。

## 使用

```bash
# 基本用法（输出到 HTML 同目录，默认 2x 分辨率）
html2png 招聘会易拉宝.html

# 指定输出路径
html2png banner.html ~/Desktop/banner.png

# 指定缩放倍率
html2png banner.html --scale=3       # 3x 分辨率
html2png banner.html --scale=1       # 原始尺寸

# 手动指定画布大小（px）
html2png a.html --width=800 --height=600

# 等待更长时间（毫秒），适合加载慢的字体/动画
html2png banner.html --wait=5000

# 手动指定 Chrome 路径
html2png banner.html --chrome=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
```

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--scale=N` | `2` | 设备像素比（1 = 原始，2 = 双倍 Retina，3 = 三倍） |
| `--width=N` | 自动 | 强制指定画布宽度（px） |
| `--height=N` | 自动 | 强制指定画布高度（px） |
| `--wait=N` | `2500` | 页面加载后额外等待时间（毫秒） |
| `--chrome=P` | 自动检测 | 手动指定浏览器可执行文件路径 |

## 画布尺寸自动检测

脚本按以下优先级自动检测画布大小：

1. CSS 变量 `--trim-w` / `--trim-h`（设计稿成品尺寸）
2. CSS 变量 `--w` / `--h`（含出血尺寸）
3. `#canvas` 元素的 `offsetWidth` / `offsetHeight`
4. `document.body` 的滚动宽高

## 浏览器检测优先级

1. `~/.cache/puppeteer/chrome-headless-shell/`（由 `npx puppeteer browsers install` 安装）
2. Google Chrome、Chromium、Microsoft Edge、Arc（系统已安装的浏览器）
3. `--chrome` 手动指定

## 依赖

- Node.js ≥ 16
- [puppeteer-core](https://www.npmjs.com/package/puppeteer-core)
- Chrome / Chromium / chrome-headless-shell（任选其一）
