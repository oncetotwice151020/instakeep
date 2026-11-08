import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InstaKeep · 喜欢的瞬间，值得好好保存",
  description: "保存你拥有或获授权的 Instagram 图片、视频、Reels 和轮播图集。无需 Instagram 登录，在线预览下载。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
