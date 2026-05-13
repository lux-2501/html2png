#!/usr/bin/env node
/**
 * html2png.js — 将本地 HTML 导出为高清 PNG
 *
 * 用法：
 *   html2png <input.html> [output.png] [--scale=2] [--width=N] [--height=N] [--wait=2500]
 *
 * 选项：
 *   --scale=N    设备像素比，1 = 原始px，2 = 双倍（Retina）    默认: 2
 *   --width=N    强制指定画布宽度（px），不填则自动读 CSS 变量  默认: 自动
 *   --height=N   强制指定画布高度（px）                         默认: 自动
 *   --wait=N     页面加载后额外等待毫秒（字体/动画等）          默认: 2500
 *   --chrome=P   手动指定 Chrome/Chromium 可执行文件路径
 *
 * 依赖：
 *   npm install puppeteer-core
 *
 * 示例：
 *   html2png 招聘会易拉宝.html                       # → 招聘会易拉宝.png（双倍分辨率）
 *   html2png banner.html out.png --scale=3           # 三倍分辨率
 *   html2png a.html b.png --width=800 --height=600  # 自定义尺寸
 */
'use strict';

const puppeteer = require('puppeteer-core');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');

// ─── 在 ~/.cache/puppeteer 里动态查找 chrome-headless-shell ─────────────────
function findCachedHeadlessShell() {
  const base = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
  if (!fs.existsSync(base)) return null;
  // 遍历所有版本目录，找第一个可执行的 chrome-headless-shell
  for (const version of fs.readdirSync(base)) {
    const versionDir = path.join(base, version);
    if (!fs.statSync(versionDir).isDirectory()) continue;
    for (const platform of fs.readdirSync(versionDir)) {
      const platformDir = path.join(versionDir, platform);
      if (!fs.statSync(platformDir).isDirectory()) continue;
      for (const file of fs.readdirSync(platformDir)) {
        if (file === 'chrome-headless-shell' || file === 'chrome-headless-shell.exe') {
          const full = path.join(platformDir, file);
          if (fs.existsSync(full)) return full;
        }
      }
    }
  }
  return null;
}

// ─── macOS / Windows / Linux Chrome 路径候选 ───────────────────────────────
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Arc.app/Contents/MacOS/Arc',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function findChrome() {
  // 1. 优先使用 puppeteer 缓存的 chrome-headless-shell（最稳定）
  const cached = findCachedHeadlessShell();
  if (cached) return cached;

  // 2. 回退到系统已安装的浏览器
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    '找不到 Chrome。请安装 Google Chrome，或：\n' +
    '  npx puppeteer browsers install chrome-headless-shell\n' +
    '也可通过 --chrome=/path/to/chrome 手动指定。'
  );
}

// ─── MIME 表 ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
};

// ─── 本地文件服务器（带 CORS 头，解决 html2canvas 跨域问题）──────────────
function startServer(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      const rawPath  = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(dir, rawPath);
      try {
        const data = fs.readFileSync(filePath);
        res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
        res.end(data);
      } catch {
        res.statusCode = 404;
        res.end('404 not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ─── 解析 CLI ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = {};
  const pos   = [];
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) flags[a.slice(2)] = true;
      else           flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

// ─── 主流程 ───────────────────────────────────────────────────────────────
async function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));

  if (!pos[0] || flags.help || flags.h) {
    console.log('用法: html2png <input.html> [output.png] [--scale=2] [--width=N] [--height=N] [--wait=2500]');
    process.exit(0);
  }

  const htmlPath   = path.resolve(pos[0]);
  const outputPath = pos[1]
    ? path.resolve(pos[1])
    : path.join(path.dirname(htmlPath), path.basename(htmlPath).replace(/\.html?$/i, '.png'));
  const scale      = parseFloat(flags.scale ?? 2);
  const extraWait  = parseInt(flags.wait ?? 2500);
  const chromePath = flags.chrome ?? findChrome();

  if (!fs.existsSync(htmlPath)) {
    console.error(`❌ 文件不存在: ${htmlPath}`);
    process.exit(1);
  }

  const htmlDir  = path.dirname(htmlPath);
  const htmlName = path.basename(htmlPath);

  log('📄 输入:', htmlPath);
  log('💾 输出:', outputPath);

  // 1. 启动本地文件服务器
  const server  = await startServer(htmlDir);
  const port    = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}/${encodeURIComponent(htmlName)}`;
  log('🌐 服务器端口:', port);

  // 2. 启动 Chrome（无头模式）
  log('🔵 Chrome:', chromePath);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    timeout: 0,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--disable-features=IsolateOrigins,site-per-process',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    log('⏳ 加载页面…');
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 3. 自动读取 CSS 变量中的画布尺寸
    const detected = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const px = v => parseInt((v || '').trim());
      const w  = px(cs.getPropertyValue('--trim-w')) || px(cs.getPropertyValue('--w')) || 0;
      const h  = px(cs.getPropertyValue('--trim-h')) || px(cs.getPropertyValue('--h')) || 0;
      if (w && h) return { w, h, src: 'css-var' };
      const el = document.getElementById('canvas');
      if (el) return { w: el.offsetWidth, h: el.offsetHeight, src: 'element' };
      return { w: document.body.scrollWidth, h: document.body.scrollHeight, src: 'body' };
    });

    const W = parseInt(flags.width  ?? detected.w);
    const H = parseInt(flags.height ?? detected.h);
    log(`📐 画布: ${W} × ${H} px  (来源: ${detected.src})  scale: ${scale}x`);
    log(`🖼  输出分辨率: ${Math.round(W * scale)} × ${Math.round(H * scale)} px`);

    // 4. 重设视口为真实画布尺寸，移除 JS 缩放
    await page.setViewport({ width: W, height: H, deviceScaleFactor: scale });
    await page.evaluate((W, H) => {
      window.removeEventListener('resize', window._fitScreen ?? (() => {}));
      const el = document.getElementById('canvas');
      if (el) {
        el.style.transform       = 'none';
        el.style.transformOrigin = 'top left';
        el.style.width           = W + 'px';
        el.style.height          = H + 'px';
      }
      document.body.style.width    = W + 'px';
      document.body.style.height   = H + 'px';
      document.body.style.overflow = 'visible';
      document.body.style.margin   = '0';
      document.body.style.padding  = '0';
    }, W, H);

    // 5. 等待字体、图片、动画稳定
    await wait(extraWait);

    // 6. 截图
    log('📸 截图中…');
    const buf = await page.screenshot({
      type:     'png',
      fullPage: false,
      clip:     { x: 0, y: 0, width: W, height: H },
    });

    fs.writeFileSync(outputPath, buf);
    const mb = (buf.length / 1024 / 1024).toFixed(1);
    log(`✅ 完成！${outputPath}`);
    log(`   ${Math.round(W * scale)} × ${Math.round(H * scale)} px · ${mb} MB`);

  } finally {
    await browser.close();
    server.close();
  }
}

function log(...args) { console.log(...args); }
function wait(ms)     { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => {
  console.error('❌ 出错:', e.message);
  process.exit(1);
});
