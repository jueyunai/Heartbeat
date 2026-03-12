"use client";

import { useEffect, useMemo, useState } from "react";
import type { CheckResult, ProviderType } from "@/lib/checker";

type TargetSummary = {
  id: string;
  name: string;
  providerType: ProviderType;
  model: string;
};

type ApiResponse = {
  ok: boolean;
  timestamp?: string;
  targets?: TargetSummary[];
  results?: CheckResult[];
  error?: {
    code: string;
    message: string;
  };
};

const providerLabelMap: Record<ProviderType, string> = {
  "openai-compatible": "OpenAI Compatible",
  "anthropic-compatible": "Anthropic Compatible",
};

const statusLabelMap: Record<CheckResult["status"], string> = {
  healthy: "正常",
  degraded: "偏慢",
  unauthorized: "鉴权失败",
  rate_limited: "限流",
  timeout: "超时",
  error: "异常",
};

const statusClassMap: Record<CheckResult["status"], string> = {
  healthy: "border-emerald-400/40 bg-emerald-400/12 text-emerald-200",
  degraded: "border-amber-400/40 bg-amber-400/12 text-amber-200",
  unauthorized: "border-fuchsia-400/40 bg-fuchsia-400/12 text-fuchsia-200",
  rate_limited: "border-orange-400/40 bg-orange-400/12 text-orange-200",
  timeout: "border-rose-400/40 bg-rose-400/12 text-rose-200",
  error: "border-red-400/40 bg-red-400/12 text-red-200",
};

function formatTime(value?: string) {
  if (!value) return "未检测";
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [pageError, setPageError] = useState("");
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingIds, setCheckingIds] = useState<string[]>([]);

  async function requestCheck(mode: "all" | "one", targetId?: string) {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode, targetId }),
    });

    const data = (await response.json()) as ApiResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || "请求失败");
    }

    return data;
  }

  async function loadTargets() {
    try {
      const response = await fetch("/api/check", { cache: "no-store" });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "加载检测目标失败");
      }

      setTargets(data.targets || []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载页面失败");
    }
  }

  useEffect(() => {
    void loadTargets();
  }, []);

  async function handleCheckAll() {
    setPageError("");
    setIsCheckingAll(true);

    try {
      const data = await requestCheck("all");
      setTargets(data.targets || []);
      setResults((current) => {
        const next = { ...current };
        for (const item of data.results || []) {
          next[item.targetId] = item;
        }
        return next;
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "检测全部失败");
    } finally {
      setIsCheckingAll(false);
    }
  }

  async function handleCheckOne(targetId: string) {
    setPageError("");
    setCheckingIds((current) => [...current, targetId]);

    try {
      const data = await requestCheck("one", targetId);
      const result = data.results?.[0];

      if (result) {
        setResults((current) => ({
          ...current,
          [targetId]: result,
        }));
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : `检测 ${targetId} 失败`);
    } finally {
      setCheckingIds((current) => current.filter((item) => item !== targetId));
    }
  }

  const summary = useMemo(() => {
    const items = Object.values(results);
    const successCount = items.filter((item) => item.success).length;
    const avgLatency = items.length
      ? Math.round(items.reduce((total, item) => total + item.latencyMs, 0) / items.length)
      : 0;
    const totalRetries = items.reduce((total, item) => total + (item.retries || 0), 0);

    return {
      total: targets.length,
      checked: items.length,
      successCount,
      failureCount: Math.max(items.length - successCount, 0),
      avgLatency,
      totalRetries,
    };
  }, [results, targets.length]);

  return (
    <main className="min-h-screen bg-[#07111f] text-[#edf4ff]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_32%),linear-gradient(180deg,_rgba(9,19,34,0.98),_rgba(5,11,21,0.98))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] opacity-20" />
          <div className="relative flex flex-col gap-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs tracking-[0.32em] text-cyan-100 uppercase">
                  Heartbeat · 轻量巡检面板
                </div>
                <div className="space-y-3">
                  <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl">
                    点击一次，刷新一次。
                    <span className="block text-cyan-200/90">只保留最必要的大模型 API 健康信号。</span>
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                    这是一个偏轻量的心跳检测首页：不做持续轮询、不做复杂历史，只在你点击时发起一次真实探测，并把状态、耗时和错误摘要清晰展示出来。
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleCheckAll}
                  disabled={isCheckingAll || targets.length === 0}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/15 px-6 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCheckingAll ? "检测进行中..." : "检测全部"}
                </button>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  已加载 {summary.total} 个目标，已检测 {summary.checked} 个
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              {[
                { label: "检测目标", value: String(summary.total), tone: "text-cyan-100" },
                { label: "成功数", value: String(summary.successCount), tone: "text-emerald-200" },
                { label: "失败数", value: String(summary.failureCount), tone: "text-rose-200" },
                { label: "平均耗时", value: summary.avgLatency ? `${summary.avgLatency} ms` : "--", tone: "text-amber-200" },
                { label: "重试次数", value: String(summary.totalRetries), tone: "text-purple-200" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 backdrop-blur-sm"
                >
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                  <div className={`mt-3 text-3xl font-semibold ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#091423]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
          <div className="overflow-hidden rounded-[22px] border border-white/8 bg-black/10">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1.3fr_1.1fr] gap-4 border-b border-white/8 px-5 py-4 text-xs uppercase tracking-[0.24em] text-slate-400">
              <div>目标</div>
              <div>协议</div>
              <div>状态</div>
              <div>耗时</div>
              <div>最后结果</div>
              <div className="text-right">操作</div>
            </div>

            <div className="divide-y divide-white/6">
              {targets.map((target) => {
                const result = results[target.id];
                const isChecking = checkingIds.includes(target.id);
                return (
                  <div
                    key={target.id}
                    className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-[1.5fr_1fr_1fr_1fr_1.3fr_1.1fr] md:items-center"
                  >
                    <div className="space-y-2">
                      <div className="text-lg font-medium text-white">{target.name}</div>
                      <div className="text-sm text-slate-400">{target.model}</div>
                    </div>

                    <div>
                      <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                        {providerLabelMap[target.providerType]}
                      </span>
                    </div>

                    <div>
                      {result ? (
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs ${statusClassMap[result.status]}`}
                        >
                          {statusLabelMap[result.status]}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                          未检测
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-slate-200">{result ? `${result.latencyMs} ms` : "--"}</div>

                    <div className="space-y-1 text-sm">
                      <div className="text-slate-200">{result?.message || "等待首次检测"}</div>
                      <div className="text-slate-500">{formatTime(result?.checkedAt)}</div>
                      {result && result.retries > 0 && (
                        <div className="text-xs text-amber-400">重试 {result.retries} 次</div>
                      )}
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleCheckOne(target.id)}
                        disabled={isChecking}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 text-sm text-slate-100 transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isChecking ? "检测中..." : "检测"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {pageError}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
