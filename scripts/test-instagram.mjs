import test from "node:test";
import assert from "node:assert/strict";
import { DownloadError, extractPublicPage, isMediaUrl, parsePostUrl, readBounded, resolvePost } from "../lib/instagram.ts";

const post = parsePostUrl("https://www.instagram.com/p/Abc123_/?igsh=tracking");
const image = "https://scontent.cdninstagram.com/example.jpg?foo=1&bar=2";
const video = "https://video.xx.fbcdn.net/example.mp4";
const script = data => `<script type="application/json" data-sjs>${JSON.stringify(data)}</script>`;

test("normalizes posts, reels and username-prefixed links; removes tracking", () => {
  assert.equal(post.url, "https://www.instagram.com/p/Abc123_/");
  assert.equal(parsePostUrl("https://instagram.com/creator/reels/Abc123_/").kind, "reel");
  assert.equal(parsePostUrl("http://m.instagram.com/tv/Abc123_").url, "https://www.instagram.com/tv/Abc123_/");
});
test("rejects off-domain URLs, credentials, ports and unsupported paths", () => {
  for (const url of ["https://instagram.com.evil.test/p/Abc123_", "https://instagram.com@127.0.0.1/p/Abc123_", "https://www.instagram.com:444/p/Abc123_", "https://www.instagram.com/stories/user/123", "https://www.instagram.com/p/abc%2f123", "file:///p/Abc123_", "https://www.instagram.com/p/Abc123_\\@evil.test"]) assert.throws(() => parsePostUrl(url), DownloadError);
});
test("CDN allowlist requires HTTPS, hostname boundaries and no credentials", () => {
  assert.ok(isMediaUrl(image)); assert.ok(isMediaUrl(video));
  for (const url of ["http://scontent.cdninstagram.com/a.jpg", "https://cdninstagram.com.evil.test/a.jpg", "https://localhost/a.jpg", "https://127.0.0.1/a.jpg", "https://scontent.cdninstagram.com:444/a.jpg", "https://user@scontent.cdninstagram.com/a.jpg", "https://www.instagram.com/accounts/login"]) assert.equal(isMediaUrl(url), false);
});
test("extracts modern logged-out mixed carousels in order at best available resolution", () => {
  const data = { data: { xig_polaris_media: { if_not_gated_logged_out: { code: post.shortcode, user: { username: "artist" }, caption: { text: "My work" }, carousel_media: [{ image_versions2: { candidates: [{ url: image + "&small=1", width: 100, height: 100 }, { url: image, width: 1080, height: 1350 }] } }, { media_type: 2, video_versions: [{ url: video, width: 1080, height: 1920 }], image_versions2: { candidates: [{ url: image }] } }] } } } };
  const result = extractPublicPage(script(data), post);
  assert.equal(result.username, "artist"); assert.equal(result.caption, "My work"); assert.equal(result.items.length, 2);
  assert.equal(result.items[0].url, image); assert.equal(result.items[1].type, "video"); assert.equal(result.partial, false);
});
test("reads legacy sharedData and excludes unrelated media", () => {
  const data = { entry_data: { PostPage: [{ graphql: { shortcode_media: { shortcode: post.shortcode, display_url: image, dimensions: { width: 1080, height: 1080 } } } }] } };
  assert.equal(extractPublicPage(`<script>window._sharedData = ${JSON.stringify(data)};</script>`, post).items[0].url, image);
  assert.equal(extractPublicPage(script({ shortcode: "Another", display_url: image }), post), null);
});
test("honors explicit privacy gates and private accounts", () => {
  assert.throws(() => extractPublicPage(script({ data: { xig_polaris_media: { if_not_gated_logged_out: null } } }), post), DownloadError);
  assert.throws(() => extractPublicPage(script({ shortcode: post.shortcode, owner: { is_private: true }, display_url: image }), post), DownloadError);
});
test("does not substitute a poster image for a video", () => {
  assert.equal(extractPublicPage(script({ shortcode: post.shortcode, is_video: true, display_url: image }), post), null);
  const meta = `<meta property="og:url" content="${post.url}"><meta property="og:type" content="video"><meta property="og:image" content="${image}">`;
  assert.equal(extractPublicPage(meta, post), null);
});
test("extracts canonical OpenGraph media, decodes entities, marks incomplete image metadata", () => {
  const html = `<meta content="${post.url}" property="og:url"><meta property='og:image' content='${image.replaceAll("&", "&amp;")}'><meta property="og:description" content="Art &amp; nature">`;
  const result = extractPublicPage(html, post);
  assert.equal(result.items[0].url, image); assert.equal(result.caption, "Art & nature"); assert.equal(result.partial, true);
  assert.equal(extractPublicPage(html.replace(post.url, "https://www.instagram.com/"), post), null);
});
test("bounded reader rejects oversized bodies without content-length", async () => {
  await assert.rejects(readBounded(new Response("a".repeat(1025)), 1024), DownloadError);
});
test("resolver refuses login and off-domain redirects and never fetches their target", async () => {
  const original = globalThis.fetch;
  for (const location of ["https://www.instagram.com/accounts/login/", "https://127.0.0.1/admin"]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location } }); };
    try { await assert.rejects(resolvePost("https://www.instagram.com/p/NoGate1/"), DownloadError); assert.equal(calls, 1); }
    finally { globalThis.fetch = original; }
  }
});
test("resolver caches resolved media and shares in-flight requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(script({ shortcode: "Cache123", display_url: image })); };
  try { const [a, b] = await Promise.all([resolvePost("https://www.instagram.com/p/Cache123/"), resolvePost("https://www.instagram.com/p/Cache123/")]); assert.equal(a.items[0].url, image); assert.deepEqual(a, b); await resolvePost(a.url); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});
