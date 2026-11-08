import { apiError, DownloadError, rateLimit, readBounded, resolvePost } from "@/lib/instagram";
import { checkOrigin, preflight, withCors } from "@/lib/cors";

export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    rateLimit(request);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new DownloadError("请使用 JSON 提交链接。", 415);
    let body;
    try { body = JSON.parse(await readBounded(new Response(request.body), 4096)); } catch (error) { if (error instanceof DownloadError) throw error; throw new DownloadError("请求格式不正确。", 400); }
    const result = await resolvePost(body?.url);
    return withCors(request, Response.json({ url: result.url, shortcode: result.shortcode, username: result.username, caption: result.caption, partial: result.partial, items: result.items.map(({ type, width, height }) => ({ type, width, height })) }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }));
  } catch (error) { return withCors(request, apiError(error)); }
}
