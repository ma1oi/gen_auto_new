"use client";

import Link from "next/link";
import { GeneratorPipeline } from "@/components/kanban/generator-pipeline";
import { AppNav } from "@/components/app-nav";
import { Zap, Settings } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex-shrink-0 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm px-6 py-3.5">
        <div className="relative flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">Generator Pipeline</h1>
              <p className="text-xs text-slate-500">WPROMO · Jira</p>
            </div>
          </div>

          <AppNav className="absolute left-1/2 -translate-x-1/2" />

          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 pt-5">
        <div className="max-w-[1800px] mx-auto h-full">
          <GeneratorPipeline />
        </div>
      </main>
    </div>
  );
}
