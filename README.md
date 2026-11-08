# InstaKeep

中文 Instagram 图片、视频、Reels 和轮播下载网站。使用 React + TypeScript + Vinext，服务端运行在 Cloudflare Workers；也可在本机运行。

## 本地启动

需要 Node.js 22.13 或更新版本。第一次运行：

```powershell
npm run install:ci
npm run dev
```

打开终端打印的地址，默认是 http://127.0.0.1:5173 。停止服务时按 Ctrl+C。

生产构建和本地生产预览：

```powershell
npm run build
npm start
```

## 使用

1. 从 Instagram 复制自己拥有或已获授权的公开帖子链接。
2. 粘贴链接，勾选下载权限确认，点击「解析链接」。
3. 预览媒体，下载单个文件或当前筛选结果中的全部文件。多个文件逐个保存，浏览器可能需要允许多文件下载。

「体验示例」使用本站原创 SVG 插画，明确标为示例，不会伪装成真实解析结果。最近 12 条成功解析记录仅写入浏览器 localStorage，可清除。

## 工作方式与限制

- `POST /api/resolve` 接收 `{ "url": "https://www.instagram.com/p/SHORTCODE/", "authorized": true }`，读取公开网页内已有的媒体数据，并返回类型、尺寸、作者与文字信息。
- `GET /api/media?post=ENCODED_POST_URL&index=0` 从同一帖子解析得到的 CDN 地址流式转发文件；添加 `preview=1` 返回图片或视频封面。支持视频 Range 请求。
- 不要求或接收 Instagram 账号密码、登录 Cookie、私密账号凭证；不绕过登录页、访问挑战或私密内容限制，也不调用隐藏的 GraphQL 接口。
- Instagram 可能改变页面结构、要求登录、限流或拒绝云服务器访问。因此不能保证每条公开链接都可解析。服务器也必须能连接 Instagram 及其 CDN。失败会返回明确错误。
- 公开元数据有时只包含图集首图，这类结果会标为部分内容；不会把视频封面误报为视频下载。
- 保留上游可用文件，不转码，不额外添加水印；不承诺取得上传前的原始文件。图片上限 25 MB，视频上限 250 MB。
- 应用不把媒体写入文件存储；解析结果在服务器内存短暂缓存 3 分钟。没有应用数据库。Hosting 提供方可能另有运行日志。
- 下载不代表获得转载、改编或商用授权。公开可见也不等于可自由使用。

安全措施包括严格的帖子域名及路径校验、CDN 域名白名单、每次重定向复验、响应体和媒体体积限制、流式大小限制、跨站 POST 校验、短期内存缓存和每实例频率限制。频率限制是每 Worker 实例的保护，并非跨实例的全局配额。新建的 Sites 部署默认仅所有者可访问。

## 检查

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --test scripts/test-instagram.mjs
```

11 项自动化检查覆盖规范化、SSRF 输入、CDN 范围、现代及旧版页面、混合轮播、私密访问限制、视频封面误判、OG 降级、响应大小、重定向及缓存合并。

浏览器验证脚本 `scripts/browser-qa.mjs` 使用独立安装于被忽略的 `outputs/qa` 目录中的 playwright-core 和系统 Edge；不属于应用依赖：

```powershell
npm install --prefix outputs/qa --no-save --no-audit --no-fund playwright-core
node scripts/browser-qa.mjs
```

脚本验证桌面/390 px 手机布局、输入错误、授权提示、示例文件真实下载、媒体筛选、记录弹窗、FAQ、接口边界，以及真实公开 Reels 的解析与 1024 字节 Range 传输。第三方媒体测试受上游状态影响。截图及报告在被忽略的 `outputs/qa-results/` 目录。

## 主要文件

- `app/page.tsx`：中文交互界面。
- `app/globals.css`：响应式样式。
- `lib/instagram.ts`：公开页面解析、URL 校验、缓存、限流。
- `app/api/resolve/route.ts`、`app/api/media/route.ts`：解析与下载接口。
- `public/demo/`：可自由保存的本站原创插画素材。
- `.openai/hosting.json`：Sites 项目标识，发布时保留。

上游格式研究参考：[yt-dlp Instagram extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/instagram.py)。本项目独立实现，仅读取公开网页，不使用其登录、模拟客户端或 GraphQL 流程。
