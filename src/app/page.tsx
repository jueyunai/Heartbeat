"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AvailableModelsResult, CheckResult, ProviderType } from "@/lib/checker";

type TargetSummary = {
  id: string;
  name: string;
  providerType: ProviderType;
  models: string[];
  status?: string;
};

type CheckApiResponse = {
  ok: boolean;
  timestamp?: string;
  targets?: TargetSummary[];
  results?: CheckResult[];
  error?: {
    code: string;
    message: string;
  };
};

type ModelsApiResponse = {
  ok: boolean;
  timestamp?: string;
  results?: AvailableModelsResult[];
  error?: {
    code: string;
    message: string;
  };
};

type OpenPanel =
  | {
      type: "configured" | "available";
      targetId: string;
    }
  | null;

type AvailableModelGroup = "claude" | "gpt" | "domestic";

type EndpointGroupTab = "all" | AvailableModelGroup;

type GroupedAvailableModels = Record<AvailableModelGroup, string[]>;

type ModelsLoadState = "idle" | "loading" | "success" | "error";

const providerLabelMap: Record<ProviderType, string> = {
  "openai-compatible": "OpenAI Compatible",
  "openai-responses": "OpenAI Responses",
  "anthropic-compatible": "Anthropic Compatible",
};

const availableModelGroupLabelMap: Record<AvailableModelGroup, string> = {
  claude: "Claude 分组",
  gpt: "GPT 分组",
  domestic: "国产分组",
};

const endpointGroupTabLabelMap: Record<EndpointGroupTab, string> = {
  all: "全部端点",
  claude: "Claude 分组",
  gpt: "GPT 分组",
  domestic: "国产分组",
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

const targetStatusClassMap: Record<string, string> = {
  可用: "border-emerald-400/40 bg-emerald-400/12 text-emerald-200",
  不可用: "border-rose-400/40 bg-rose-400/12 text-rose-200",
};

function getTargetStatusClassName(status?: string) {
  if (!status) {
    return "";
  }

  return targetStatusClassMap[status] || "border-slate-300/20 bg-slate-300/10 text-slate-200";
}

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

function summarizeModels(models: string[], limit = 2) {
  if (models.length <= limit) {
    return models.join("、");
  }

  return `${models.slice(0, limit).join("、")} 等 ${models.length} 个`;
}

function getPanelKey(type: "configured" | "available", targetId: string) {
  return `${type}:${targetId}`;
}

function getAvailableModelGroup(model: string): AvailableModelGroup {
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.includes("claude")) {
    return "claude";
  }

  if (normalizedModel.includes("gpt")) {
    return "gpt";
  }

  return "domestic";
}

function groupAvailableModels(models: string[]): GroupedAvailableModels {
  return models.reduce<GroupedAvailableModels>(
    (groups, model) => {
      groups[getAvailableModelGroup(model)].push(model);
      return groups;
    },
    {
      claude: [],
      gpt: [],
      domestic: [],
    },
  );
}

function getEndpointGroup(models: string[]): AvailableModelGroup {
  const groupedModels = groupAvailableModels(models);

  if (groupedModels.claude.length > 0) {
    return "claude";
  }

  if (groupedModels.gpt.length > 0) {
    return "gpt";
  }

  return "domestic";
}

export default function Home() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult[]>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, AvailableModelsResult>>({});
  const [modelsLoadState, setModelsLoadState] = useState<Record<string, ModelsLoadState>>({});
  const [modelsLoadError, setModelsLoadError] = useState<Record<string, string>>({});
  const [activeEndpointGroupTab, setActiveEndpointGroupTab] = useState<EndpointGroupTab>("all");
  const [availableModelTabs, setAvailableModelTabs] = useState<Record<string, AvailableModelGroup>>({});
  const [pageError, setPageError] = useState("");
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingIds, setCheckingIds] = useState<string[]>([]);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [copiedModelKey, setCopiedModelKey] = useState("");
  const panelContainerRef = useRef<HTMLDivElement | null>(null);

  async function requestCheck(mode: "all" | "one", targetId?: string) {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode, targetId }),
    });

    const data = (await response.json()) as CheckApiResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || "请求失败");
    }

    return data;
  }

  async function requestModelsForTarget(targetId: string) {
    const response = await fetch(`/api/models?targetId=${encodeURIComponent(targetId)}`, {
      cache: "no-store",
    });

    const data = (await response.json()) as ModelsApiResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || "加载模型列表失败");
    }

    return data.results?.[0] || null;
  }

  async function loadTargets() {
    try {
      const targetsResponse = await fetch("/api/check", { cache: "no-store" });
      const targetsData = (await targetsResponse.json()) as CheckApiResponse;

      if (!targetsResponse.ok || !targetsData.ok) {
        throw new Error(targetsData.error?.message || "加载检测目标失败");
      }

      setTargets(targetsData.targets || []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载页面失败");
    }
  }

  useEffect(() => {
    void loadTargets();
  }, []);

  useEffect(() => {
    if (!copiedModelKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopiedModelKey("");
    }, 1600);

    return () => window.clearTimeout(timeout);
  }, [copiedModelKey]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!panelContainerRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !panelContainerRef.current.contains(target)) {
        setOpenPanel(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setAvailableModelTabs((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([targetId]) => targets.some((target) => target.id === targetId)),
      ) as Record<string, AvailableModelGroup>;

      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [targets]);

  async function handleCopyModel(type: "configured" | "available", targetId: string, model: string) {
    try {
      await navigator.clipboard.writeText(model);
      setCopiedModelKey(`${getPanelKey(type, targetId)}:${model}`);
    } catch {
      setPageError("复制失败，请检查浏览器是否允许访问剪贴板");
    }
  }

  function togglePanel(type: "configured" | "available", targetId: string) {
    setOpenPanel((current) => {
      if (current?.type === type && current.targetId === targetId) {
        return null;
      }

      return { type, targetId };
    });
  }

  function handleAvailableModelTabChange(targetId: string, group: AvailableModelGroup) {
    setAvailableModelTabs((current) => ({
      ...current,
      [targetId]: group,
    }));
  }

  async function handleCheckAll() {
    setPageError("");
    setIsCheckingAll(true);

    try {
      const data = await requestCheck("all");
      setTargets(data.targets || []);
      setResults((current) => {
        const grouped = { ...current };
        for (const target of data.targets || []) {
          grouped[target.id] = [];
        }
        for (const item of data.results || []) {
          if (!grouped[item.targetId]) {
            grouped[item.targetId] = [];
          }
          grouped[item.targetId].push(item);
        }
        return grouped;
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
    setModelsLoadState((current) => ({
      ...current,
      [targetId]: "loading",
    }));
    setModelsLoadError((current) => {
      const next = { ...current };
      delete next[targetId];
      return next;
    });

    const [checkResult, modelsResult] = await Promise.allSettled([
      requestCheck("one", targetId),
      requestModelsForTarget(targetId),
    ]);

    if (checkResult.status === "fulfilled") {
      const data = checkResult.value;
      if (data.results) {
        setResults((current) => ({
          ...current,
          [targetId]: data.results || [],
        }));
      }
    } else {
      setPageError(checkResult.reason instanceof Error ? checkResult.reason.message : `检测 ${targetId} 失败`);
    }

    if (modelsResult.status === "fulfilled") {
      const modelResult = modelsResult.value;
      if (modelResult) {
        setAvailableModels((current) => ({
          ...current,
          [targetId]: modelResult,
        }));
      }
      setModelsLoadState((current) => ({
        ...current,
        [targetId]: "success",
      }));
    } else {
      setModelsLoadState((current) => ({
        ...current,
        [targetId]: "error",
      }));
      setModelsLoadError((current) => ({
        ...current,
        [targetId]: modelsResult.reason instanceof Error ? modelsResult.reason.message : "加载模型列表失败",
      }));
    }

    setCheckingIds((current) => current.filter((item) => item !== targetId));
  }

  const summary = useMemo(() => {
    const items = Object.values(results).flat();
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

  const endpointCountsByGroup = useMemo(() => {
    return targets.reduce<Record<AvailableModelGroup, number>>(
      (counts, target) => {
        const endpointGroup = getEndpointGroup(availableModels[target.id]?.models || target.models);
        counts[endpointGroup] += 1;
        return counts;
      },
      {
        claude: 0,
        gpt: 0,
        domestic: 0,
      },
    );
  }, [availableModels, targets]);

  const visibleTargets = useMemo(() => {
    if (activeEndpointGroupTab === "all") {
      return targets;
    }

    return targets.filter((target) => getEndpointGroup(availableModels[target.id]?.models || target.models) === activeEndpointGroupTab);
  }, [activeEndpointGroupTab, availableModels, targets]);

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
                    <span className="block text-cyan-200/90">端点内多个模型会并行检测，并展示上游可用模型列表。</span>
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
                  已加载 {summary.total} 个端点，已检测 {summary.checked} 个模型
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              {[
                { label: "检测端点", value: String(summary.total), tone: "text-cyan-100" },
                { label: "成功模型", value: String(summary.successCount), tone: "text-emerald-200" },
                { label: "失败模型", value: String(summary.failureCount), tone: "text-rose-200" },
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

        <section className="mt-6 rounded-[28px] border border-white/10 bg-[#091423]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5" ref={panelContainerRef}>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-white/8 pb-4">
            {(Object.keys(endpointGroupTabLabelMap) as EndpointGroupTab[]).map((group) => {
              const isActive = activeEndpointGroupTab === group;
              const count = group === "all" ? targets.length : endpointCountsByGroup[group];

              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => setActiveEndpointGroupTab(group)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    isActive
                      ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  {endpointGroupTabLabelMap[group]} ({count})
                </button>
              );
            })}
          </div>
          <div className="space-y-4">
            {visibleTargets.length > 0 ? (
              visibleTargets.map((target) => {
                const targetResults = results[target.id] || [];
                const modelsResult = availableModels[target.id];
                const modelsState = modelsLoadState[target.id] || "idle";
                const modelsError = modelsLoadError[target.id];
                const availableModelGroups = groupAvailableModels(modelsResult?.models || []);
                const activeAvailableModelTab = availableModelTabs[target.id] || "claude";
                const activeAvailableModels = availableModelGroups[activeAvailableModelTab];
                const isChecking = checkingIds.includes(target.id);
                const configuredModelsText = summarizeModels(target.models);
                const availableModelsText = modelsResult?.models?.length
                  ? summarizeModels(modelsResult.models, 3)
                  : modelsState === "loading"
                    ? "加载中..."
                    : modelsState === "error"
                      ? modelsError || modelsResult?.message || "加载模型列表失败"
                      : modelsResult?.message || "点击检测端点后加载";
                const configuredPanelOpen = openPanel?.type === "configured" && openPanel.targetId === target.id;
                const availablePanelOpen = openPanel?.type === "available" && openPanel.targetId === target.id;

                return (
                <div
                  key={target.id}
                  className="rounded-[24px] border border-white/8 bg-black/10 px-5 py-5 backdrop-blur-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-lg font-medium text-white">{target.name}</div>
                        <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                          {providerLabelMap[target.providerType]}
                        </span>
                        {target.status ? (
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${getTargetStatusClassName(target.status)}`}>
                            {target.status}
                          </span>
                        ) : null}
                      </div>

                      <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">已配模型</div>
                          <div className="relative max-w-full">
                            <button
                              type="button"
                              onClick={() => togglePanel("configured", target.id)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                            >
                              <span className="truncate text-slate-200">{configuredModelsText}</span>
                              {target.models.length > 2 ? (
                                <span className="shrink-0 text-xs text-cyan-200">{configuredPanelOpen ? "收起" : "展开"}</span>
                              ) : null}
                            </button>
                            {target.models.length > 2 && configuredPanelOpen ? (
                              <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(42rem,calc(100vw-4rem))] rounded-2xl border border-white/10 bg-[#0d1b2d] px-4 py-3 text-sm text-slate-100 shadow-2xl">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">全部已配模型</div>
                                  <button
                                    type="button"
                                    onClick={() => setOpenPanel(null)}
                                    className="text-xs text-slate-400 transition hover:text-white"
                                  >
                                    关闭
                                  </button>
                                </div>
                                <div className="mb-3 text-xs text-slate-500">点击模型名称即可复制，共 {target.models.length} 个</div>
                                <div className="max-h-72 overflow-auto pr-1">
                                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {target.models.map((model) => {
                                      const copyKey = `${getPanelKey("configured", target.id)}:${model}`;
                                      const copied = copiedModelKey === copyKey;

                                      return (
                                        <button
                                          key={model}
                                          type="button"
                                          onClick={() => handleCopyModel("configured", target.id, model)}
                                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-left text-xs text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                                        >
                                          {copied ? `已复制：${model}` : model}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">上游可用模型</div>
                          <div className="relative max-w-full">
                            <button
                              type="button"
                              onClick={() => togglePanel("available", target.id)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                            >
                              <span className="truncate text-slate-200">{availableModelsText}</span>
                              {modelsResult?.models && modelsResult.models.length > 3 ? (
                                <span className="shrink-0 text-xs text-cyan-200">{availablePanelOpen ? "收起" : "展开"}</span>
                              ) : null}
                            </button>
                            {modelsResult?.models && modelsResult.models.length > 3 && availablePanelOpen ? (
                              <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(56rem,calc(100vw-4rem))] rounded-2xl border border-white/10 bg-[#0d1b2d] px-4 py-3 text-sm text-slate-100 shadow-2xl">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">全部可用模型</div>
                                  <button
                                    type="button"
                                    onClick={() => setOpenPanel(null)}
                                    className="text-xs text-slate-400 transition hover:text-white"
                                  >
                                    关闭
                                  </button>
                                </div>
                                <div className="mb-3 text-xs text-slate-500">点击模型名称即可复制，共 {modelsResult.models.length} 个</div>
                                <div className="mb-3 flex flex-wrap gap-2">
                                  {(Object.keys(availableModelGroupLabelMap) as AvailableModelGroup[]).map((group) => {
                                    const isActive = activeAvailableModelTab === group;
                                    const count = availableModelGroups[group].length;

                                    return (
                                      <button
                                        key={group}
                                        type="button"
                                        onClick={() => handleAvailableModelTabChange(target.id, group)}
                                        className={`rounded-full border px-3 py-1 text-xs transition ${
                                          isActive
                                            ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                                            : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                                        }`}
                                      >
                                        {availableModelGroupLabelMap[group]} ({count})
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="max-h-80 overflow-auto pr-1">
                                  {activeAvailableModels.length > 0 ? (
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                      {activeAvailableModels.map((model) => {
                                        const copyKey = `${getPanelKey("available", target.id)}:${model}`;
                                        const copied = copiedModelKey === copyKey;

                                        return (
                                          <button
                                            key={model}
                                            type="button"
                                            onClick={() => handleCopyModel("available", target.id, model)}
                                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-left text-xs text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                                          >
                                            {copied ? `已复制：${model}` : model}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-400">
                                      该分组暂无模型
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleCheckOne(target.id)}
                        disabled={isChecking}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 text-sm text-slate-100 transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isChecking ? "检测中..." : "检测端点"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[20px] border border-white/8 bg-white/[0.02]">
                    <div className="grid grid-cols-[1.3fr_0.8fr_0.8fr_1.6fr] gap-4 border-b border-white/8 px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                      <div>模型</div>
                      <div>状态</div>
                      <div>耗时</div>
                      <div>最后结果</div>
                    </div>
                    <div className="divide-y divide-white/6">
                      {target.models.map((model) => {
                        const result = targetResults.find((item) => item.model === model);
                        return (
                          <div
                            key={`${target.id}-${model}`}
                            className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.3fr_0.8fr_0.8fr_1.6fr] md:items-center"
                          >
                            <div className="text-sm text-slate-200">{model}</div>
                            <div>
                              {result ? (
                                <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${statusClassMap[result.status]}`}>
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
                              {result && result.retries > 0 ? (
                                <div className="text-xs text-amber-400">重试 {result.retries} 次</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-10 text-center text-sm text-slate-400">
                当前分组下暂无端点
              </div>
            )}
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
