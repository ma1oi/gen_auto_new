import type { Metadata } from "next";
import "./globals.css";
import { Notifications } from "@/components/notifications";
import { GeneratorStatusWatcher } from "@/components/generator-status-watcher";

export const metadata: Metadata = {
  title: "Generator Pipeline",
  description: "Локальная панель управления пайплайном генератора WPROMO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full dark">
      <body className="h-full flex flex-col bg-[#0b0f1a] text-slate-200 overflow-y-auto">
        {children}
        <Notifications />
        <GeneratorStatusWatcher />
      </body>
    </html>
  );
}
