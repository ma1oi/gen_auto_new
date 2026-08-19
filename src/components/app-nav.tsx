"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Генератор" },
  { href: "/manual-upload", label: "Ручники" },
  { href: "/yadisk", label: "Я.Диск" },
  { href: "/cache", label: "Кеш" },
];

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              active
                ? "bg-slate-700/80 text-slate-200"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
