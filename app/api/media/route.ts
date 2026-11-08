import { apiError, DownloadError, isMediaUrl, rateLimit, resolvePost } from "@/lib/instagram";
import { checkOrigin, preflight, withCors } from "@/lib/cors";

export const OPTIONS = preflight;

export async function GET(request: Request) {
  try {
    checkOrigin(request);
    rateLimit(request, 90);
    const params = new URL(request.url).searchParams;
    const indexText = params.get("index");
    if (!indexText || !/^\d{1,2}$/.test(indexText)) throw new DownloadError("无效的媒体序号。", 400);
    const index = Number(indexText);
    const result = await resolvePost(params.get("post"));
    const item = result.items[index];
    if (!item) throw new DownloadError("未找到该媒体，请重新解析链接。", 404);
    const preview = params.get("preview") === "1";
    let url = preview && item.thumbnail ? item.thumbnail : item.url;
    if (preview && item.type === "video" && !item.thumbnail) throw new DownloadError("暂无视频封面。", 404);
    let upstream: Response | undefined;
    const range = request.headers.get("range");
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new DownloadError("无效的文件范围。", 400);
    for (let redirects = 0; redirects < 4; redirects++) {
      if (!isMediaUrl(url)) throw new DownloadError("媒体地址不在允许的 Instagram CDN 范围内。", 403);
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(90000), headers: { Referer: "https://www.instagram.com/", ...(range && !preview ? { Range: range } : {}) } });
      if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("location"); await response.body?.cancel(); if (!location) break; url = new URL(location, url).href; continue; }
      upstream = response; break;
    }
    if (!upstream?.ok || !upstream.body) { await upstream?.body?.cancel(); throw new DownloadError("媒体链接已过期或被 Instagram 限制，请稍后重新解析。", 502); }
    const contentType = upstream.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" };
    if (!extensions[contentType] || (preview ? !contentType.startsWith("image/") : !contentType.startsWith(item.type === "video" ? "video/" : "image/"))) { await upstream.body.cancel(); throw new DownloadError("上游未返回预期的图片或视频文件。", 502); }
    const limit = (preview || item.type === "image" ? 25 : 250) * 1024 * 1024;
    const length = upstream.headers.get("content-length");
    if (length && Number(length) > limit) { await upstream.body.cancel(); throw new DownloadError("文件过大：图片最大 25 MB，视频最大 250 MB。", 413); }
    const filename = `instagram_${result.shortcode}_${index + 1}.${extensions[contentType]}`;
    const headers = new Headers({ "Content-Type": contentType, "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    for (const name of ["content-length", "content-range", "accept-ranges"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
    let transferred = 0;
    const body = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { transferred += chunk.byteLength; if (transferred > limit) { controller.error(new Error("Media exceeds the transfer limit")); return; } controller.enqueue(chunk); } }));
    return withCors(request, new Response(body, { status: upstream.status, headers }));
  } catch (error) { return withCors(request, apiError(error)); }
}
