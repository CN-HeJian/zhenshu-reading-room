import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "枕书｜我的阅读札记",
  description: "收藏原文、阅读批注与微信里的读书痕迹。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
