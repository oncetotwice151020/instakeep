import deployment from "../github-pages/deployment.json";
import { DownloadError } from "./instagram";

export function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || deployment.allowedFrontendOrigins.includes(origin);
}

export function checkOrigin(request: Request) {
  if (!isAllowedOrigin(request)) throw new DownloadError("请求来源无效。", 403);
}

export function withCors(request: Request, response: Response) {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedOrigin(request)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Range, Accept-Ranges");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function preflight(request: Request) {
  if (!isAllowedOrigin(request)) return Response.json({ error: "请求来源无效。" }, { status: 403 });
  const method = request.headers.get("access-control-request-method");
  if (method && !["GET", "POST"].includes(method)) return Response.json({ error: "请求方法不受支持。" }, { status: 405 });
  return withCors(request, new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Range", "Access-Control-Max-Age": "600" } }));
}
