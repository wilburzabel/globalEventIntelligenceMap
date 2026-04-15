"use client";

import {
  AI_CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  type AiConfig,
} from "@/types/aiConfig";
import { useEffect, useState } from "react";

const PROVIDER_OPTIONS = ["openai", "anthropic", "azure", "custom"];

export default function AiConfigPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [config, setConfig] = useState<AiConfig>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_AI_CONFIG;
    }

    const rawValue = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_AI_CONFIG;
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<AiConfig>;
      return {
        provider: parsed.provider ?? DEFAULT_AI_CONFIG.provider,
        apiKey: parsed.apiKey ?? DEFAULT_AI_CONFIG.apiKey,
        baseUrl: parsed.baseUrl ?? DEFAULT_AI_CONFIG.baseUrl,
        model: parsed.model ?? DEFAULT_AI_CONFIG.model,
      };
    } catch {
      return DEFAULT_AI_CONFIG;
    }
  });

  useEffect(() => {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  return (
    <section className="shrink-0 rounded-2xl border border-slate-300/80 bg-white/85 p-4 shadow-sm backdrop-blur md:p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">AI 配置</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            本地存储
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            aria-expanded={isExpanded}
          >
            {isExpanded ? "收起" : "展开"}
          </button>
        </div>
      </header>

      {isExpanded ? (
        <div className="mt-3 grid gap-2.5">
          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Provider
            <select
              value={config.provider}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, provider: event.target.value }))
              }
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-300 focus:outline-none"
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-medium text-slate-700">
            API Key
            <input
              type="password"
              value={config.apiKey}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, apiKey: event.target.value }))
              }
              placeholder="sk-..."
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none"
            />
          </label>

          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Base URL
            <input
              type="text"
              value={config.baseUrl}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, baseUrl: event.target.value }))
              }
              placeholder="https://api.example.com/v1"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none"
            />
          </label>

          <label className="grid gap-1 text-xs font-medium text-slate-700">
            Model
            <input
              type="text"
              value={config.model}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, model: event.target.value }))
              }
              placeholder="deepseek-chat"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none"
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
