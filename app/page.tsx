"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, Clipboard, Clock3, ExternalLink, Film, Image as ImageIcon, Layers3, Link2, LoaderCircle, LockKeyhole, Play, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";

type Media = { type: "image" | "video"; width?: number; height?: number; preview: string; download: string; filename: string };
type Result = { shortcode: string; url: string; caption: string; username: string; partial?: boolean; items: Media[]; demo?: boolean };
type HistoryItem = { url: string; time: number; count: number };
type Tab = "all" | "image" | "video" | "carousel";
const historyKey = "instakeep-history-v1";
const assetPath = (path: string) => `${import.meta.env.BASE_URL || "/"}${path.replace(/^\/+/, "")}`;
const staticOnly = import.meta.env.VITE_STATIC_ONLY === "true";
const privateWorkspaceUrl = import.meta.env.VITE_PRIVATE_WORKSPACE_URL || "https://instakeep-studio-7q8m.shininghazel2.chatgpt.site";
const tabs = [{ id: "all", label: "全部内容", icon: Layers3 }, { id: "image", label: "图片", icon: ImageIcon }, { id: "video", label: "视频 / Reels", icon: Film }, { id: "carousel", label: "轮播图集", icon: Layers3 }] as const;
const faqs = [
  ["可以下载哪些内容？", "支持公开可访问的 Instagram 帖子、图片、视频、Reels 和轮播图集。请仅保存你自己发布、已获得作者授权，或其他依法有权下载的内容。"],
  ["需要输入 Instagram 账号或密码吗？", "不需要。InstaKeep 不收集你的 Instagram 密码、Cookie 或登录凭证，也不提供私密账号内容的下载。"],
  ["为什么有些公开链接无法解析？", "Instagram 可能要求登录、限制访问频率，或拒绝服务器访问；已删除、受地区限制的内容也可能无法读取。出现这些情况时，页面会提示失败。你可以稍后重试，或向作者索取原文件。"],
  ["图片和视频会保存在哪里？", "点击下载后，文件会保存到浏览器的默认下载目录。媒体由服务器流式转发，不写入应用文件存储。最近解析记录仅保存在当前浏览器，你可以随时清除。"],
  ["下载后可以直接转载或商用吗？", "下载不代表获得转载、改编或商业使用权。请遵守作者授权、适用法律以及 Instagram 的相关条款，使用时保留需要的署名。"],
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("all");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [downloaded, setDownloaded] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const activeItems = result?.items.map((item, index) => ({ ...item, index })).filter(item => tab === "all" || (tab === "carousel" ? result.items.length > 1 : item.type === tab)) ?? [];

  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem(historyKey) || "[]"); if (Array.isArray(stored)) setHistory(stored.filter(item => typeof item.url === "string" && /^https:\/\/www\.instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/$/.test(item.url) && Number.isFinite(item.time)).slice(0, 12)); } catch { /* Local storage can be unavailable. */ }
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (showHistory) historyDialog.current?.showModal(); else historyDialog.current?.close(); }, [showHistory]);

  function saveHistory(next: HistoryItem[]) { setHistory(next); try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* History is optional. */ } }

  async function resolve(target = url) {
    if (loading || busy !== null) return;
    if (staticOnly) { window.location.assign(privateWorkspaceUrl); return; }
    setError("");
    if (!target.trim()) { setError("请先粘贴一个 Instagram 帖子或 Reels 链接。"); inputRef.current?.focus(); return; }
    setLoading(true); setResult(null); setDownloaded([]);
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target.trim() }), signal: controller.signal });
      const data = await response.json() as Omit<Result, "items"> & { error?: string; items: { type: "image" | "video"; width?: number; height?: number }[] };
      if (!response.ok) throw new Error(data.error || "暂时无法解析，请稍后再试。");
      const next: Result = { ...data, items: data.items.map((item: { type: "image" | "video"; width?: number; height?: number }, index: number) => ({ ...item, preview: `/api/media?post=${encodeURIComponent(data.url)}&index=${index}&preview=1`, download: `/api/media?post=${encodeURIComponent(data.url)}&index=${index}`, filename: `instagram_${data.shortcode}_${index + 1}.${item.type === "video" ? "mp4" : "jpg"}` })) };
      setResult(next); setUrl(data.url);
      saveHistory([{ url: data.url, time: Date.now(), count: data.items.length }, ...history.filter(item => item.url !== data.url)].slice(0, 12));
    } catch (err) { setError(err instanceof Error && err.name === "AbortError" ? "请求超时。请检查网络，或稍后重试。" : err instanceof Error ? err.message : "网络连接失败，请稍后重试。"); }
    finally { clearTimeout(timer); setLoading(false); }
  }

  async function paste() {
    try { const text = await navigator.clipboard.readText(); setUrl(text.trim()); setError(""); inputRef.current?.focus(); }
    catch { setNotice("浏览器未允许读取剪贴板，请在输入框中使用 Ctrl / ⌘ + V 粘贴。"); inputRef.current?.focus(); }
  }

  function showDemo() {
    if (loading || busy !== null) return;
    setError(""); setTab("all"); setDownloaded([]);
    setResult({ shortcode: "demo", url: "", caption: "把山野、海岸和日落，装进自己的灵感收藏。", username: "instakeep.studio", demo: true, items: ["mountains", "coast", "sunset"].map(name => ({ type: "image", width: 1200, height: 1500, preview: assetPath(`demo/${name}.svg`), download: assetPath(`demo/${name}.svg`), filename: `instakeep_${name}.svg` })) });
  }

  async function saveFile(item: Media, index: number) {
    const response = await fetch(item.download);
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error || "下载失败，请重新解析链接后再试。"); }
    const blob = await response.blob();
    const file = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || item.filename;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = file;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    setDownloaded(previous => [...new Set([...previous, index])]);
  }

  async function download(index?: number) {
    if (!result || busy !== null) return;
    setBusy(index ?? "all"); setError("");
    try {
      const items = index === undefined ? activeItems : [{ ...result.items[index], index }];
      for (const item of items) await saveFile(item, item.index);
      setNotice(items.length > 1 ? "已向浏览器提交下载。如被拦截，请允许此网站下载多个文件。" : "已向浏览器提交下载，请查看下载列表。");
    } catch (err) { setError(err instanceof Error ? err.message : "下载失败，请稍后重试。"); }
    finally { setBusy(null); }
  }

  return (
    <div className="site-shell">
      <header className="header"><a href="#" className="brand" aria-label="InstaKeep 首页"><span className="brand-icon"><ArrowDownToLine size={21} strokeWidth={2.5} /></span><span>Insta<span className="brand-green">Keep</span><span className="brand-dot">.</span></span></a><nav aria-label="主导航"><a href="#workspace" className="nav-active">下载工具</a><a href="#how-it-works">使用指南</a><a href="#faq">常见问题</a></nav><button className="history-trigger" aria-label="最近记录" onClick={() => setShowHistory(true)}><Clock3 size={17} /><span>最近记录</span>{history.length > 0 && <b>{history.length}</b>}</button></header>
      <main>
        <section className="hero" aria-labelledby="hero-title"><div className="eyebrow"><span className="live-dot" />YOUR MOMENTS, WELL KEPT</div><h1 id="hero-title">喜欢的瞬间，<span>值得好好保存<svg viewBox="0 0 390 15" aria-hidden="true"><path d="M4 10 Q170 -2 386 7" /></svg></span></h1><p className="hero-copy">一个链接，轻松保存 Instagram 图片、视频与 Reels。<br className="mobile-break" />让创作灵感，随时在手边。</p><div className="hero-perks"><span><Check size={14} />无需 Instagram 登录</span><span><Check size={14} />保留可用清晰度</span><span><Check size={14} />不添加水印</span></div></section>
        <section className="workspace" id="workspace" aria-label="Instagram 下载工具">
          <div className="tool-top"><div className="tool-tabs" role="tablist" aria-label="媒体类型">{tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "tool-tab selected" : "tool-tab"} onClick={() => setTab(id)}><Icon size={17} /><span>{label}</span></button>)}</div><span className="tool-badge"><span />在线工具</span></div>
          <div className="tool-body">{staticOnly && <div className="static-notice"><LockKeyhole size={16} /><span>公开静态展示版 · 真实解析与下载服务保持私有。</span><a href={privateWorkspaceUrl} target="_blank" rel="noreferrer">私人工作台<ExternalLink size={12} /></a></div>}<div className="input-heading"><label htmlFor="post-url">粘贴你的 Instagram 链接</label><span>支持帖子、Reels 和图集</span></div>
            <form onSubmit={event => { event.preventDefault(); void resolve(); }}><div className={`url-input-wrap${error ? " has-error" : ""}`}><Link2 size={22} className="input-icon" /><input ref={inputRef} id="post-url" aria-describedby={error ? "tool-error" : "url-hint"} type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={1000} value={url} onChange={event => { setUrl(event.target.value); setError(""); }} placeholder="https://www.instagram.com/p/..." disabled={loading || busy !== null} /><button className="paste-button" type="button" aria-label="粘贴链接" onClick={paste} disabled={loading || busy !== null}><Clipboard size={15} /><span>粘贴</span></button><button className="resolve-button" type="submit" disabled={loading || busy !== null}>{loading ? <><LoaderCircle size={18} className="spin" />解析中</> : <>{staticOnly ? "打开私人工作台" : "解析链接"}<ArrowRight size={18} /></>}</button></div><div className="input-actions"><button className="demo-button" type="button" onClick={showDemo} disabled={loading || busy !== null}><Play size={12} fill="currentColor" />体验示例<ArrowRight size={13} /></button></div></form>
            <p className="sr-only" id="url-hint">支持 instagram.com 的 p、reel、reels、tv 帖子链接。</p>
            {error && <div className="error-box" id="tool-error" role="alert"><CircleHelp size={18} /><span>{error}</span></div>}
            {loading && <div className="loading-panel" role="status"><span className="loading-art"><Link2 size={25} /><LoaderCircle size={45} className="spin" /></span><strong>正在读取公开内容</strong><p>正在检查链接并寻找可下载的媒体，请稍候…</p><div className="loading-track"><span /></div></div>}
            {!result && !loading && <div className="empty-panel"><div className="empty-visual" aria-hidden="true"><div className="mini-photo back"><img src={assetPath("demo/coast.svg")} alt="" /></div><div className="mini-photo front"><img src={assetPath("demo/mountains.svg")} alt="" /><span><ImageIcon size={12} />Keep the moment</span></div><span className="floating-download"><ArrowDownToLine size={22} /></span><span className="spark spark-one">✧</span><span className="spark spark-two">✦</span></div><div className="empty-text"><span className="small-label">A LITTLE SPACE FOR YOUR INSPIRATION</span><h2>把灵感，留在身边</h2><p>粘贴链接后，可在这里预览并下载内容。</p><div className="file-pills"><span>JPG / PNG</span><span>MP4</span><span>多图轮播</span></div></div></div>}
            {result && !loading && <section className="result-panel" aria-label="解析结果"><div className="result-heading"><div><span className="result-status"><CheckCheck size={16} />{result.demo ? "示例预览 · 原创插画素材" : "解析完成"}</span><h2>{result.username ? `@${result.username}` : "你的 Instagram 内容"}<span>{result.items.length} 个文件</span></h2></div><button className="download-all" disabled={busy !== null || activeItems.length === 0} onClick={() => void download()}>{busy === "all" ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />}{activeItems.length > 1 ? "下载当前全部" : "下载文件"}</button></div>{result.demo && <p className="result-note">以下为本站原创 SVG 示例，不来自 Instagram，可自由下载体验。</p>}{result.partial && <p className="result-note">公开页面仅提供部分预览媒体，结果可能不包含完整图集。</p>}{result.caption && <p className="caption">{result.caption}</p>}<div className="media-grid">{activeItems.map(item => <article className="media-card" key={item.index}><div className="media-preview">{item.type === "video" ? <video controls preload="metadata" poster={item.preview} src={item.download} /> : <img src={item.preview} alt={`媒体 ${item.index + 1}`} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("preview-unavailable"); }} />}<span className="media-number">{String(item.index + 1).padStart(2, "0")}</span><span className="media-type">{item.type === "video" ? <Film size={12} /> : <ImageIcon size={12} />}{result.demo ? "SVG" : item.type === "video" ? "MP4" : "图片"}</span></div><div className="media-info"><div><strong>{item.type === "video" ? "视频" : "图片"} {String(item.index + 1).padStart(2, "0")}</strong><span>{item.width && item.height ? `${item.width} × ${item.height}` : "公开可用画质"}</span></div><button disabled={busy !== null} aria-label={`下载第 ${item.index + 1} 个文件`} onClick={() => void download(item.index)}>{busy === item.index || busy === "all" ? <LoaderCircle size={19} className="spin" /> : downloaded.includes(item.index) ? <Check size={19} /> : <ArrowDownToLine size={19} />}</button></div></article>)}</div>{activeItems.length === 0 && <div className="filter-empty">此结果中没有{tab === "video" ? "视频" : tab === "image" ? "图片" : "轮播图集"}。<button onClick={() => setTab("all")}>查看全部内容 <ArrowRight size={14} /></button></div>}{result.url && <a className="original-link" href={result.url} target="_blank" rel="noreferrer">在 Instagram 查看原帖<ExternalLink size={13} /></a>}</section>}
          </div><div className="tool-footer"><span><ShieldCheck size={15} />尊重创作，保存有权使用的内容</span><span><LockKeyhole size={13} />不收集 Instagram 登录信息</span></div>
        </section>
        <section className="feature-row" aria-label="支持的内容"><article><span className="feature-icon peach"><ImageIcon size={22} /></span><div><h3>每一张，都清晰</h3><p>保存公开可用的图片画质</p></div><span className="feature-tag">图片</span></article><article><span className="feature-icon lilac"><Film size={22} /></span><div><h3>让精彩，随时重播</h3><p>视频与 Reels，轻松保存</p></div><span className="feature-tag">视频</span></article><article><span className="feature-icon mint"><Layers3 size={22} /></span><div><h3>一组灵感，一次收藏</h3><p>轮播图集，逐张预览下载</p></div><span className="feature-tag">图集</span></article></section>
        <section className="how-section" id="how-it-works"><div className="section-intro"><span className="small-label">JUST THREE SIMPLE STEPS</span><h2>保存灵感，只需三步</h2><p>从喜欢，到留存。简单一点。</p></div><div className="steps"><article><span className="step-number">01</span><span className="step-icon"><Link2 size={22} /></span><h3>复制内容链接</h3><p>打开 Instagram，在帖子或 Reels 的<br />分享菜单中选择「复制链接」。</p></article><span className="step-connector"><ArrowRight size={20} /></span><article><span className="step-number">02</span><span className="step-icon"><Clipboard size={22} /></span><h3>粘贴并解析</h3><p>将链接粘贴到上方，<br />点击「解析链接」。</p></article><span className="step-connector"><ArrowRight size={20} /></span><article><span className="step-number">03</span><span className="step-icon"><ArrowDownToLine size={22} /></span><h3>预览，下载，收藏</h3><p>选择要保存的图片或视频，<br />下载到你的设备。</p></article></div></section>
        <section className="faq-section" id="faq"><div className="faq-intro"><span className="small-label">GOOD TO KNOW</span><h2>也许你想了解</h2><p>关于下载、隐私和内容使用。</p><span className="faq-doodle" aria-hidden="true"><CircleHelp size={56} strokeWidth={1} /><Sparkles size={24} /></span></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></section>
        <aside className="respect-note"><span className="respect-icon"><ShieldCheck size={24} /></span><div><h3>让灵感流动，也让创作被尊重。</h3><p>仅下载你拥有或获授权的内容。公开可见不等于允许转载，请尊重版权与个人隐私。</p></div><span className="respect-mark" aria-hidden="true">With respect, always.</span></aside>
      </main>
      <footer className="footer"><a href="#" className="brand footer-brand"><span className="brand-icon"><ArrowDownToLine size={16} /></span><span>Insta<span className="brand-green">Keep</span>.</span></a><p>一个小工具，留住好灵感。<span>独立工具，与 Instagram / Meta 无关联。</span></p><a href="#workspace">回到下载工具<ArrowDown size={13} className="rotate-up" /></a></footer>
      {notice && <div className="toast" role="status"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><X size={15} /></button></div>}
      <dialog ref={historyDialog} className="history-dialog" onCancel={() => setShowHistory(false)} onClick={event => { if (event.target === historyDialog.current) setShowHistory(false); }}><div className="dialog-top"><div><span className="small-label">ONLY ON THIS DEVICE</span><h2>最近解析记录</h2></div><button aria-label="关闭记录" onClick={() => setShowHistory(false)}><X size={21} /></button></div><p className="dialog-description">仅保存在当前浏览器，最多保留 12 条。</p>{history.length ? <><div className="history-list">{history.map(item => <button key={item.url} onClick={() => { setUrl(item.url); setShowHistory(false); inputRef.current?.focus(); document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" }); }}><span className="history-item-icon"><Link2 size={17} /></span><span><strong>{item.url.replace("https://www.instagram.com/", "instagram.com/")}</strong><small>{new Date(item.time).toLocaleString("zh-CN")} · {item.count} 个文件</small></span><ArrowRight size={16} /></button>)}</div><button className="clear-history" onClick={() => saveHistory([])}><Trash2 size={15} />清除全部记录</button></> : <div className="no-history"><Clock3 size={34} /><p>还没有解析记录</p><span>成功解析的链接会出现在这里。</span></div>}</dialog>
    </div>
  );
}
