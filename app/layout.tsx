import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focus Lab · 研究数据采集",
  description: "认知疲劳研究辅助 · 非医学诊断 · 摄像头本地处理",
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
