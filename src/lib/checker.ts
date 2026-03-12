import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ProviderType = "openai-compatible" | "anthropic-compatible";

export type CheckTarget = {
  id: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  enabled: boolean;
  maxRetries?: number;
  degradedThresholdMs?: number;
  checkPrompt?: string;
};

export type CheckStatus = "healthy" | "degraded" | "unauthorized" | "rate_limited" | "timeout" | "error";

export type CheckResult = {
  targetId: string;
  targetName: string;
  providerType: ProviderType;
  success: boolean;
  status: CheckStatus;
  latencyMs: number;
  statusCode: number | null;
  message: string;
  checkedAt: string;
  retries: number; // 新增：实际重试次数
};

// 默认配置常量
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 0;
const DEFAULT_DEGRADED_THRESHOLD_MS = 4000;
const DEFAULT_CHECK_PROMPT = "ping";
const ANTHROPIC_VERSION = "2023-06-01";

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function toPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

type ProviderEnvConfig = {
  providerType: ProviderType;
  prefix: "OPENAI" | "ANTHROPIC";
  defaultName: string;
  defaultApiKeyEnv: string;
};

const providerEnvConfigs: ProviderEnvConfig[] = [
  {
    providerType: "openai-compatible",
    prefix: "OPENAI",
    defaultName: "OpenAI 通道",
    defaultApiKeyEnv: "OPENAI_API_KEY",
  },
  {
    providerType: "anthropic-compatible",
    prefix: "ANTHROPIC",
    defaultName: "Anthropic 通道",
    defaultApiKeyEnv: "ANTHROPIC_API_KEY",
  },
];

const CONFIG_FILE_PATH = path.join(process.cwd(), "config", "targets.json");

type RawCheckTarget = {
  id?: string;
  name?: string;
  providerType?: ProviderType;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  enabled?: boolean;
  maxRetries?: number;
  degradedThresholdMs?: number;
  checkPrompt?: string;
};

type RawCheckerDefaults = {
  timeoutMs?: number;
  enabled?: boolean;
  maxRetries?: number;
  degradedThresholdMs?: number;
  checkPrompt?: string;
};

type RawCheckerConfig = {
  defaults?: RawCheckerDefaults;
  targets?: RawCheckTarget[];
};

function isProviderType(value: unknown): value is ProviderType {
  return value === "openai-compatible" || value === "anthropic-compatible";
}

function normalizeJsonDefaults(defaults?: RawCheckerDefaults) {
  return {
    timeoutMs: toPositiveNumber(
      typeof defaults?.timeoutMs === "number" ? String(defaults.timeoutMs) : undefined,
      DEFAULT_TIMEOUT_MS,
    ),
    enabled: defaults?.enabled ?? true,
    maxRetries: toPositiveNumber(
      typeof defaults?.maxRetries === "number" ? String(defaults.maxRetries) : undefined,
      DEFAULT_MAX_RETRIES,
    ),
    degradedThresholdMs: toPositiveNumber(
      typeof defaults?.degradedThresholdMs === "number" ? String(defaults.degradedThresholdMs) : undefined,
      DEFAULT_DEGRADED_THRESHOLD_MS,
    ),
    checkPrompt: defaults?.checkPrompt || DEFAULT_CHECK_PROMPT,
  };
}

function normalizeJsonTarget(target: RawCheckTarget, defaults: ReturnType<typeof normalizeJsonDefaults>): CheckTarget | null {
  if (!target.id || !target.name || !isProviderType(target.providerType) || !target.baseUrl || !target.model) {
    return null;
  }

  return {
    id: target.id,
    name: target.name,
    providerType: target.providerType,
    baseUrl: trimTrailingSlash(target.baseUrl),
    model: target.model,
    apiKey: target.apiKey || "",
    timeoutMs: toPositiveNumber(
      typeof target.timeoutMs === "number" ? String(target.timeoutMs) : undefined,
      defaults.timeoutMs,
    ),
    enabled: target.enabled ?? defaults.enabled,
    maxRetries: toPositiveNumber(
      typeof target.maxRetries === "number" ? String(target.maxRetries) : undefined,
      defaults.maxRetries,
    ),
    degradedThresholdMs: toPositiveNumber(
      typeof target.degradedThresholdMs === "number" ? String(target.degradedThresholdMs) : undefined,
      defaults.degradedThresholdMs,
    ),
    checkPrompt: target.checkPrompt || defaults.checkPrompt,
  };
}

function readTargetsFromJsonConfig(): CheckTarget[] {
  if (!existsSync(CONFIG_FILE_PATH)) {
    return [];
  }

  try {
    const content = readFileSync(CONFIG_FILE_PATH, "utf-8");
    const parsed = JSON.parse(content) as RawCheckerConfig;
    const defaults = normalizeJsonDefaults(parsed.defaults);

    if (!Array.isArray(parsed.targets)) {
      return [];
    }

    return parsed.targets
      .map((target) => normalizeJsonTarget(target, defaults))
      .filter((target): target is CheckTarget => target !== null);
  } catch {
    return [];
  }
}

function collectProviderIndices(prefix: ProviderEnvConfig["prefix"]) {
  const indices = new Set<number>();
  const pattern = new RegExp(`^${prefix}_(\\d+)_(BASE_URL|MODEL|NAME|API_KEY|TIMEOUT_MS|MAX_RETRIES|DEGRADED_THRESHOLD_MS|CHECK_PROMPT)$`);

  for (const key of Object.keys(process.env)) {
    const match = key.match(pattern);
    if (match) {
      indices.add(Number(match[1]));
    }
  }

  return [...indices].sort((a, b) => a - b);
}

function buildTargetFromIndexedEnv(config: ProviderEnvConfig, index: number): CheckTarget | null {
  const prefix = `${config.prefix}_${index}_`;
  const baseUrl = process.env[`${prefix}BASE_URL`];
  const model = process.env[`${prefix}MODEL`];

  if (!baseUrl || !model) {
    return null;
  }

  return {
    id: `${config.prefix.toLowerCase()}-${index}`,
    name: process.env[`${prefix}NAME`] || `${config.defaultName} ${index}`,
    providerType: config.providerType,
    baseUrl: trimTrailingSlash(baseUrl),
    model,
    apiKey: process.env[`${prefix}API_KEY`] || process.env[config.defaultApiKeyEnv] || "",
    timeoutMs: toPositiveNumber(process.env[`${prefix}TIMEOUT_MS`], DEFAULT_TIMEOUT_MS),
    enabled: true,
    maxRetries: toPositiveNumber(process.env[`${prefix}MAX_RETRIES`], DEFAULT_MAX_RETRIES),
    degradedThresholdMs: toPositiveNumber(
      process.env[`${prefix}DEGRADED_THRESHOLD_MS`],
      DEFAULT_DEGRADED_THRESHOLD_MS,
    ),
    checkPrompt: process.env[`${prefix}CHECK_PROMPT`] || DEFAULT_CHECK_PROMPT,
  };
}

function buildLegacyTarget(config: ProviderEnvConfig): CheckTarget | null {
  const baseUrl = process.env[`${config.prefix}_BASE_URL`];
  const model = process.env[`${config.prefix}_MODEL`];

  if (!baseUrl || !model) {
    return null;
  }

  return {
    id: `${config.prefix.toLowerCase()}-main`,
    name: process.env[`${config.prefix}_NAME`] || config.defaultName,
    providerType: config.providerType,
    baseUrl: trimTrailingSlash(baseUrl),
    model,
    apiKey: process.env[`${config.prefix}_API_KEY`] || "",
    timeoutMs: toPositiveNumber(process.env[`${config.prefix}_TIMEOUT_MS`], DEFAULT_TIMEOUT_MS),
    enabled: true,
    maxRetries: toPositiveNumber(process.env[`${config.prefix}_MAX_RETRIES`], DEFAULT_MAX_RETRIES),
    degradedThresholdMs: toPositiveNumber(
      process.env[`${config.prefix}_DEGRADED_THRESHOLD_MS`],
      DEFAULT_DEGRADED_THRESHOLD_MS,
    ),
    checkPrompt: process.env[`${config.prefix}_CHECK_PROMPT`] || DEFAULT_CHECK_PROMPT,
  };
}

function buildTargets(): CheckTarget[] {
  const jsonTargets = readTargetsFromJsonConfig();
  if (jsonTargets.length > 0) {
    return jsonTargets;
  }

  const targets: CheckTarget[] = [];

  for (const config of providerEnvConfigs) {
    const indexedTargets = collectProviderIndices(config.prefix)
      .map((index) => buildTargetFromIndexedEnv(config, index))
      .filter((target): target is CheckTarget => target !== null);

    if (indexedTargets.length > 0) {
      targets.push(...indexedTargets);
      continue;
    }

    const legacyTarget = buildLegacyTarget(config);
    if (legacyTarget) {
      targets.push(legacyTarget);
    }
  }

  if (targets.length === 0) {
    return [
      {
        id: "demo-openai",
        name: "演示 OpenAI",
        providerType: "openai-compatible",
        baseUrl: "https://demo.invalid/v1",
        model: "gpt-demo-mini",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        enabled: true,
        maxRetries: DEFAULT_MAX_RETRIES,
        degradedThresholdMs: DEFAULT_DEGRADED_THRESHOLD_MS,
        checkPrompt: DEFAULT_CHECK_PROMPT,
      },
      {
        id: "demo-anthropic",
        name: "演示 Anthropic",
        providerType: "anthropic-compatible",
        baseUrl: "https://demo.invalid",
        model: "claude-demo-mini",
        timeoutMs: DEFAULT_TIMEOUT_MS,
        enabled: true,
        maxRetries: DEFAULT_MAX_RETRIES,
        degradedThresholdMs: DEFAULT_DEGRADED_THRESHOLD_MS,
        checkPrompt: DEFAULT_CHECK_PROMPT,
      },
    ];
  }

  return targets;
}

export function getTargets() {
  return buildTargets().filter((target) => target.enabled);
}

function sanitizeMessage(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/("x-api-key"\s*:\s*")[^"]+("?)/gi, "$1***$2")
    .replace(/("api[_-]?key"\s*:\s*")[^"]+("?)/gi, "$1***$2")
    .slice(0, 240);
}

function classifyStatus(statusCode: number | null, timedOut = false): CheckStatus {
  if (timedOut) return "timeout";
  if (statusCode === null) return "error";
  if (statusCode === 401 || statusCode === 403) return "unauthorized";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "error";
  return "healthy";
}

async function parseErrorMessage(response: Response) {
  try {
    const text = await response.text();
    return sanitizeMessage(text || response.statusText || "上游请求失败");
  } catch {
    return "上游请求失败";
  }
}

// 判断是否需要重试
function shouldRetry(statusCode: number | null, timedOut: boolean): boolean {
  // 超时、服务器错误（5xx）、限流（429）需要重试
  if (timedOut) return true;
  if (statusCode === null) return true;
  if (statusCode >= 500) return true;
  if (statusCode === 429) return true;
  return false;
}

// 计算退避延迟（指数退避 + 抖动）
function getRetryDelay(attempt: number): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt), 10000); // 最大10秒
  const jitter = Math.random() * 500; // 0-500ms 随机抖动
  return baseDelay + jitter;
}

async function checkOpenAICompatibleOnce(target: CheckTarget): Promise<CheckResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.apiKey || ""}`,
      },
      body: JSON.stringify({
        model: target.model,
        messages: [{ role: "user", content: target.checkPrompt || DEFAULT_CHECK_PROMPT }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        targetId: target.id,
        targetName: target.name,
        providerType: target.providerType,
        success: false,
        status: classifyStatus(response.status),
        latencyMs,
        statusCode: response.status,
        message: await parseErrorMessage(response),
        checkedAt: new Date().toISOString(),
        retries: 0,
      };
    }

    const degradedThreshold = target.degradedThresholdMs ?? DEFAULT_DEGRADED_THRESHOLD_MS;
    return {
      targetId: target.id,
      targetName: target.name,
      providerType: target.providerType,
      success: true,
      status: latencyMs > degradedThreshold ? "degraded" : "healthy",
      latencyMs,
      statusCode: response.status,
      message: "检测成功",
      checkedAt: new Date().toISOString(),
      retries: 0,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      targetId: target.id,
      targetName: target.name,
      providerType: target.providerType,
      success: false,
      status: classifyStatus(null, timedOut),
      latencyMs: Date.now() - startedAt,
      statusCode: null,
      message: timedOut ? "请求超时" : sanitizeMessage(error instanceof Error ? error.message : "请求失败"),
      checkedAt: new Date().toISOString(),
      retries: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkAnthropicCompatibleOnce(target: CheckTarget): Promise<CheckResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${target.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": target.apiKey || "",
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: target.model,
        max_tokens: 1,
        temperature: 0,
        messages: [{ role: "user", content: target.checkPrompt || DEFAULT_CHECK_PROMPT }],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        targetId: target.id,
        targetName: target.name,
        providerType: target.providerType,
        success: false,
        status: classifyStatus(response.status),
        latencyMs,
        statusCode: response.status,
        message: await parseErrorMessage(response),
        checkedAt: new Date().toISOString(),
        retries: 0,
      };
    }

    const degradedThreshold = target.degradedThresholdMs ?? DEFAULT_DEGRADED_THRESHOLD_MS;
    return {
      targetId: target.id,
      targetName: target.name,
      providerType: target.providerType,
      success: true,
      status: latencyMs > degradedThreshold ? "degraded" : "healthy",
      latencyMs,
      statusCode: response.status,
      message: "检测成功",
      checkedAt: new Date().toISOString(),
      retries: 0,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      targetId: target.id,
      targetName: target.name,
      providerType: target.providerType,
      success: false,
      status: classifyStatus(null, timedOut),
      latencyMs: Date.now() - startedAt,
      statusCode: null,
      message: timedOut ? "请求超时" : sanitizeMessage(error instanceof Error ? error.message : "请求失败"),
      checkedAt: new Date().toISOString(),
      retries: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkOpenAICompatible(target: CheckTarget): Promise<CheckResult> {
  const maxRetries = target.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastResult: CheckResult | null = null;
  let totalRetries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await checkOpenAICompatibleOnce(target);
    lastResult = result;

    // 成功或不需要重试的错误，直接返回
    if (result.success || !shouldRetry(result.statusCode, result.status === "timeout")) {
      return { ...result, retries: totalRetries };
    }

    // 还有重试次数，等待后重试
    if (attempt < maxRetries) {
      totalRetries++;
      const delay = getRetryDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 重试耗尽，返回最后一次结果
  return { ...lastResult!, retries: totalRetries };
}

async function checkAnthropicCompatible(target: CheckTarget): Promise<CheckResult> {
  const maxRetries = target.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastResult: CheckResult | null = null;
  let totalRetries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await checkAnthropicCompatibleOnce(target);
    lastResult = result;

    // 成功或不需要重试的错误，直接返回
    if (result.success || !shouldRetry(result.statusCode, result.status === "timeout")) {
      return { ...result, retries: totalRetries };
    }

    // 还有重试次数，等待后重试
    if (attempt < maxRetries) {
      totalRetries++;
      const delay = getRetryDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 重试耗尽，返回最后一次结果
  return { ...lastResult!, retries: totalRetries };
}

export async function checkTarget(target: CheckTarget) {
  if (target.providerType === "openai-compatible") {
    return checkOpenAICompatible(target);
  }

  return checkAnthropicCompatible(target);
}

export async function checkAllTargets() {
  const targets = getTargets();
  return Promise.all(targets.map((target) => checkTarget(target)));
}

export function findTargetById(targetId: string) {
  return getTargets().find((target) => target.id === targetId);
}
