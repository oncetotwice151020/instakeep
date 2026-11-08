/** Public-page extraction only. No login cookies, hidden APIs, or challenge bypass. */
export class DownloadError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.name = "DownloadError"; this.status = status; }
}
export type Post = { url: string; shortcode: string; kind: string };
export type MediaAsset = { type: "image" | "video"; url: string; thumbnail?: string; width?: number; height?: number };
export type ResolvedPost = Post & { caption: string; username: string; partial: boolean; items: MediaAsset[] };
type Json = Record<string, any>;
const pageHosts = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const blockedMessage = "Instagram 暂未允许读取此内容：可能需要登录、内容受限或触发了访问限流。请稍后重试，或向作者索取原文件。";

export function parsePostUrl(input: unknown): Post {
  if (typeof input !== "string" || input.length > 1000 || /[\\\u0000-\u0020]/.test(input.trim())) throw new DownloadError("请提供有效的 Instagram 帖子或 Reels 链接。", 400);
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new DownloadError("链接格式不正确，请复制完整的 Instagram 链接。", 400); }
  if (!["https:", "http:"].includes(url.protocol) || !pageHosts.has(url.hostname) || url.username || url.password || url.port) throw new DownloadError("只支持 instagram.com 上的公开帖子链接。", 400);
  const match = url.pathname.match(/^\/(?:[A-Za-z0-9_.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,28})\/?$/);
  if (!match) throw new DownloadError("请使用帖子、Reels 或 IGTV 的完整链接；暂不支持个人主页、Stories 或私密分享链接。", 400);
  const kind = match[1] === "reels" ? "reel" : match[1];
  return { url: `https://www.instagram.com/${kind}/${match[2]}/`, kind, shortcode: match[2] };
}

export function isMediaUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 8000) return false;
  try {
    const u = new URL(input);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && ["cdninstagram.com", "fbcdn.net"].some(host => u.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function dimension(input: unknown) { const n = Number(input); return Number.isFinite(n) && n > 0 && n <= 20000 ? Math.round(n) : undefined; }
function text(input: unknown, max = 4000) { return typeof input === "string" ? input.slice(0, max) : ""; }
function decode(input: string) {
  return input.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const names: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const n = entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
}
function best(values: unknown): Json | undefined {
  if (!Array.isArray(values)) return;
  return values.filter(v => v && isMediaUrl(v.url || v.src)).sort((a, b) => (Number(b.width || b.config_width) || 0) * (Number(b.height || b.config_height) || 0) - (Number(a.width || a.config_width) || 0) * (Number(a.height || a.config_height) || 0))[0];
}
function asset(node: Json): MediaAsset | null {
  const video = best(node.video_versions);
  const image = best(node.image_versions2?.candidates) || best(node.display_resources);
  const thumbnail = image?.url || image?.src || node.display_url || node.thumbnail_src;
  const videoUrl = video?.url || node.video_url;
  const isVideo = node.is_video === true || node.media_type === 2 || /Video/.test(node.__typename || "");
  if (isMediaUrl(videoUrl)) return { type: "video", url: videoUrl, thumbnail: isMediaUrl(thumbnail) ? thumbnail : undefined, width: dimension(video?.width || node.dimensions?.width || node.original_width), height: dimension(video?.height || node.dimensions?.height || node.original_height) };
  // A video's cover must never be presented as a successfully extracted video.
  if (isVideo) return null;
  if (isMediaUrl(thumbnail)) return { type: "image", url: thumbnail, width: dimension(image?.width || image?.config_width || node.dimensions?.width || node.original_width), height: dimension(image?.height || image?.config_height || node.dimensions?.height || node.original_height) };
  return null;
}
function hasMedia(node: Json) { return node.carousel_media || node.edge_sidecar_to_children || node.video_versions || node.video_url || node.image_versions2 || node.display_url; }
function hasIdentity(node: Json, post: Post) { return node.code === post.shortcode || node.shortcode === post.shortcode; }
function resultFromNode(node: Json, post: Post): ResolvedPost | null {
  if (node.is_private === true || node.owner?.is_private === true || node.user?.is_private === true) throw new DownloadError("此内容来自私密账号，无法通过本工具下载。", 403);
  const children: Json[] = node.carousel_media || node.edge_sidecar_to_children?.edges?.map((edge: Json) => edge.node) || [node];
  if (!Array.isArray(children)) return null;
  const seen = new Set<string>();
  const items = children.slice(0, 20).map(asset).filter((item): item is MediaAsset => !!item).filter(item => { if (seen.has(item.url)) return false; seen.add(item.url); return true; });
  if (!items.length) return null;
  return { ...post, items, caption: text(node.caption?.text || node.edge_media_to_caption?.edges?.[0]?.node?.text), username: text(node.user?.username || node.owner?.username, 100), partial: items.length < children.length };
}
function findPost(root: unknown, post: Post): ResolvedPost | null {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let count = 0;
  while (stack.length && ++count < 25000) {
    const { value, depth } = stack.pop()!;
    if (!value || typeof value !== "object" || depth > 45) continue;
    const node = value as Json;
    if (node.xig_polaris_media && Object.hasOwn(node.xig_polaris_media, "if_not_gated_logged_out")) {
      const product = node.xig_polaris_media.if_not_gated_logged_out;
      if (!product) throw new DownloadError(blockedMessage, 403);
      if ((!product.code && !product.shortcode) || hasIdentity(product, post)) { const result = resultFromNode(product, post); if (result) return result; }
    }
    if (hasIdentity(node, post)) {
      if (node.is_private === true || node.owner?.is_private === true || node.user?.is_private === true) throw new DownloadError("此内容来自私密账号，无法通过本工具下载。", 403);
      if (hasMedia(node)) { const result = resultFromNode(node, post); if (result) return result; }
    }
    for (const child of Object.values(node)) if (child && typeof child === "object") stack.push({ value: child, depth: depth + 1 });
  }
  return null;
}
function balancedJson(source: string, start: number): string | null {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

export function extractPublicPage(html: string, post: Post): ResolvedPost | null {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1].trim();
    let parsed: unknown;
    if (body.startsWith("{") || body.startsWith("[")) { try { parsed = JSON.parse(body); } catch { /* Non-JSON scripts are ignored. */ } }
    if (parsed) { const found = findPost(parsed, post); if (found) return found; }
    for (const marker of body.matchAll(/(?:window\._sharedData\s*=|__additionalDataLoaded\([^,]+,)\s*(\{)/g)) {
      const json = balancedJson(body, marker.index! + marker[0].lastIndexOf("{"));
      if (json) { try { parsed = JSON.parse(json); } catch { continue; } const found = findPost(parsed, post); if (found) return found; }
    }
  }
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) attrs[attr[1].toLowerCase()] = decode(attr[3]);
    if (attrs.property || attrs.name) meta[attrs.property || attrs.name] = attrs.content || "";
  }
  // Require a canonical post identity to reject generic login-page artwork.
  try { if (parsePostUrl(meta["og:url"]).shortcode !== post.shortcode) return null; } catch { return null; }
  const video = meta["og:video:secure_url"] || meta["og:video"] || meta["og:video:url"];
  const image = meta["og:image:secure_url"] || meta["og:image"];
  const isVideo = /video/.test(meta["og:type"] || "") || post.kind !== "p";
  if (!isMediaUrl(video) && (isVideo || !isMediaUrl(image))) return null;
  const item: MediaAsset = isMediaUrl(video) ? { type: "video", url: video, thumbnail: isMediaUrl(image) ? image : undefined } : { type: "image", url: image };
  item.width = dimension(meta[item.type === "video" ? "og:video:width" : "og:image:width"]);
  item.height = dimension(meta[item.type === "video" ? "og:video:height" : "og:image:height"]);
  return { ...post, caption: text(meta["og:description"] || meta.description), username: "", partial: item.type === "image", items: [item] };
}

export async function readBounded(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new DownloadError("上游响应过大，无法处理。", 502); }
  if (!response.body) return "";
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > limit) { await reader.cancel(); throw new DownloadError("上游响应过大，无法处理。", 502); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const buffer = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(buffer);
}

async function publicHtml(input: string): Promise<string> {
  let url = input;
  for (let redirects = 0; redirects < 4; redirects++) {
    const target = new URL(url);
    if (!pageHosts.has(target.hostname) || target.protocol !== "https:" || target.port || target.username || target.password) throw new DownloadError(blockedMessage, 403);
    if (/\/(accounts|challenge|checkpoint|consent)\//.test(target.pathname)) throw new DownloadError(blockedMessage, 403);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(14000), headers: { "User-Agent": "Mozilla/5.0 (compatible; InstaKeep/1.0; public-media-reader)", Accept: "text/html", "Accept-Language": "en-US,en;q=0.8" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("location"); await response.body?.cancel(); if (!location) break; url = new URL(location, url).href; continue; }
    if ([401, 403, 429].includes(response.status)) { await response.body?.cancel(); throw new DownloadError(blockedMessage, response.status === 429 ? 429 : 403); }
    if (response.status === 404) { await response.body?.cancel(); throw new DownloadError("未找到此内容，请确认链接有效、帖子仍公开可见。", 404); }
    if (!response.ok) { await response.body?.cancel(); throw new DownloadError("Instagram 暂时无法访问，请稍后再试。", 502); }
    return readBounded(response, 4 * 1024 * 1024);
  }
  throw new DownloadError(blockedMessage, 403);
}

const cache = new Map<string, { result: ResolvedPost; expires: number }>();
const pending = new Map<string, Promise<ResolvedPost>>();
export async function resolvePost(input: unknown): Promise<ResolvedPost> {
  const post = parsePostUrl(input);
  const cached = cache.get(post.url);
  if (cached && cached.expires > Date.now()) return cached.result;
  if (pending.has(post.url)) return pending.get(post.url)!;
  const work = (async () => {
    try {
      const html = await publicHtml(post.url);
      let result = extractPublicPage(html, post);
      if (!result) {
        if (/"is_private"\s*:\s*true|"require_login"\s*:\s*true/.test(html)) throw new DownloadError(blockedMessage, 403);
        result = extractPublicPage(await publicHtml(`https://www.instagram.com/p/${post.shortcode}/embed/captioned/`), post);
      }
      if (!result) throw new DownloadError(blockedMessage);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(post.url, { result, expires: Date.now() + 180000 });
      return result;
    } catch (error) {
      if (error instanceof DownloadError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new DownloadError("Instagram 响应超时，请稍后重试。", 504);
      throw new DownloadError("暂时无法连接 Instagram，请确认服务器网络可访问 Instagram 后重试。", 502);
    } finally { pending.delete(post.url); }
  })();
  pending.set(post.url, work);
  return work;
}

export function apiError(error: unknown) { return Response.json({ error: error instanceof DownloadError ? error.message : "服务暂时不可用，请稍后重试。" }, { status: error instanceof DownloadError ? error.status : 500, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }

/** In-memory per-instance guard. Private hosting also restricts visitors at the edge. */
const requests = new Map<string, { count: number; reset: number }>();
export function rateLimit(request: Request, limit = 12) {
  const key = `${request.headers.get("oai-authenticated-user-id") || request.headers.get("cf-connecting-ip") || "local"}:${new URL(request.url).pathname}`;
  const now = Date.now();
  let slot = requests.get(key);
  if (!slot || slot.reset <= now) { slot = { count: 0, reset: now + 60000 }; if (requests.size >= 1000) requests.delete(requests.keys().next().value!); requests.set(key, slot); }
  if (++slot.count > limit) throw new DownloadError("操作过于频繁，请一分钟后重试。", 429);
}
