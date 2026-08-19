"use client";

import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { Database, ExternalLink, Settings } from "lucide-react";

const CACHE_PURGE_UI_URL = "/cache-purge/";

export default function CachePage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-shrink-0 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm px-6 py-3.5">
        <div className="relative flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-600/20 border border-rose-500/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">Кеш</h1>
              <p className="text-xs text-slate-500">Очистка кэша доменов</p>
            </div>
          </div>

          <AppNav className="absolute left-1/2 -translate-x-1/2" />

          <div className="flex items-center gap-2">
            <a
              href={CACHE_PURGE_UI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            >
              Открыть в новой вкладке
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <Link
              href="/settings"
              className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <iframe
          src={CACHE_PURGE_UI_URL}
          title="Cache purge"
          className="w-full h-full border-0 bg-white"
        />
      </main>
    </div>
  );
}
