import { AI_CONFIG_STORAGE_KEY, type AiConfig } from "@/types/aiConfig";
import {
  DEFAULT_ANALYZE_EVENT_RESULT,
  type EventExplanation,
  type EventImpactChain,
  type AnalyzeEventResult,
} from "@/types/eventAnalysis";
const ANALYZE_EVENT_TIMEOUT_MS = 12000;

function normalizeStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return normalizeStringList(parsed);
    } catch {
      return Array.from(
        new Set(
          trimmed
            .split(/[,\n;]/)
            .map((item) => item.trim())
            .filter(Boolean)
        )
      );
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    )
  );
}

function normalizeSentiment(value: unknown): AnalyzeEventResult["sentiment"] {
  if (value === "positive" || value === "negative" || value === "neutral") {
    return value;
  }

  return DEFAULT_ANALYZE_EVENT_RESULT.sentiment;
}

function normalizeScore(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.round(num)));
}

function normalizeExplanation(value: unknown): EventExplanation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const summary =
    typeof source.summary === "string" && source.summary.trim()
      ? source.summary.trim()
      : "";
  const drivers = normalizeStringList(source.drivers);

  if (!summary && drivers.length === 0) {
    return null;
  }

  return {
    summary:
      summary ||
      (drivers[0] ?? "该事件具备一定市场与地缘影响，建议持续观察后续变化。"),
    drivers:
      drivers.length > 0
        ? drivers
        : ["事件信息有限，建议结合后续数据与政策信号持续跟踪。"],
  };
}

function normalizeImpactChain(value: unknown): EventImpactChain | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const summary =
    typeof source.summary === "string" && source.summary.trim()
      ? source.summary.trim()
      : "";
  const steps = normalizeStringList(source.steps);

  if (!summary && steps.length === 0) {
    return null;
  }

  return {
    summary:
      summary ||
      (steps[0] ?? "事件通过预期与供需渠道向相关国家和行业扩散。"),
    steps:
      steps.length > 0
        ? steps.slice(0, 5)
        : ["事件触发初始冲击。", "冲击通过跨境或产业链路径继续传导。"],
  };
}

function buildFallbackExplanation(inputText: string, context: {
  sentiment: AnalyzeEventResult["sentiment"];
  sectors: string[];
  relatedCountries: string[];
  impactedCountries: string[];
}): EventExplanation {
  const text = inputText.toLowerCase();
  const keywordRules: Array<{ keyword: string; driver: string }> = [
    { keyword: "interest rate", driver: "利率预期变化可能直接影响估值与融资成本。" },
    { keyword: "inflation", driver: "通胀信号会影响政策路径与资产定价。" },
    { keyword: "tariff", driver: "关税变化可能扰动跨境贸易与利润率。" },
    { keyword: "sanction", driver: "制裁风险会影响供应链稳定性与风险溢价。" },
    { keyword: "oil", driver: "油气价格波动会向成本端和通胀端传导。" },
    { keyword: "gas", driver: "能源供需变化可能加剧行业成本与盈利波动。" },
    { keyword: "shipping", driver: "航运和物流扰动可能影响交付周期与库存水平。" },
    { keyword: "supply chain", driver: "供应链变化会影响产销节奏与区域分工。" },
    { keyword: "bank", driver: "金融条件变化可能影响信用扩张与流动性偏好。" },
    { keyword: "debt", driver: "债务压力上升会抬升融资风险和违约担忧。" },
    { keyword: "chip", driver: "芯片供给与监管变化会影响科技链景气度。" },
    { keyword: "semiconductor", driver: "半导体环节变化常带来产业链再定价。" },
    { keyword: "ai", driver: "AI 相关政策和供给变化会影响科技板块预期。" },
    { keyword: "election", driver: "选举与政策预期变化可能改变财政和监管方向。" },
    { keyword: "war", driver: "地缘冲突会提升风险偏好波动和避险需求。" },
    { keyword: "conflict", driver: "地缘摩擦可能扩大跨区域不确定性。" },
  ];

  const matchedDrivers = keywordRules
    .filter((rule) => text.includes(rule.keyword))
    .map((rule) => rule.driver);

  const sectorsText =
    context.sectors.length > 0
      ? `重点影响板块：${context.sectors.slice(0, 3).join("、")}。`
      : "当前未识别明确板块，需结合后续信息确认传导路径。";
  const countries = Array.from(
    new Set([
      ...context.relatedCountries,
      ...context.impactedCountries,
    ])
  ).slice(0, 3);
  const countriesText =
    countries.length > 0
      ? `涉及国家/地区：${countries.join("、")}。`
      : "当前国家维度信息有限。";
  const sentimentText =
    context.sentiment === "positive"
      ? "整体偏利好"
      : context.sentiment === "negative"
        ? "整体偏利空"
        : "整体偏中性";

  const drivers = [
    ...matchedDrivers.slice(0, 3),
    sectorsText,
    countriesText,
  ].filter(Boolean);

  return {
    summary: `${sentimentText}，主要由行业暴露、国家影响范围与关键词信号共同驱动。`,
    drivers:
      drivers.length > 0
        ? Array.from(new Set(drivers)).slice(0, 4)
        : [
            "事件关键词信号有限，建议结合板块与国家维度继续跟踪。",
            sectorsText,
            countriesText,
          ],
  };
}

function buildFallbackImpactChain(context: {
  sectors: string[];
  relatedCountries: string[];
  impactedCountries: string[];
}): EventImpactChain {
  const sourceCountry = context.relatedCountries[0] ?? "源头国家";
  const downstreamCountries = Array.from(new Set(context.impactedCountries)).slice(0, 3);
  const sectors = Array.from(new Set(context.sectors)).slice(0, 3);

  const steps: string[] = [];
  steps.push(`事件首先在 ${sourceCountry} 形成初始冲击。`);
  steps.push(
    downstreamCountries.length > 0
      ? `冲击通过贸易、政策预期或市场情绪传导至 ${downstreamCountries.join("、")}。`
      : "冲击通过跨境预期和风险偏好向外围市场扩散。"
  );
  steps.push(
    sectors.length > 0
      ? `主要影响行业链条：${sectors.join("、")}。`
      : "主要影响行业链条仍待进一步确认。"
  );
  steps.push("最终体现在相关国家资产定价与行业风险溢价变化。");

  return {
    summary: "该事件从源头国家出发，经过跨境与行业链条逐步扩散至其他市场。",
    steps: steps.slice(0, 5),
  };
}

function buildFallbackAnalyzeResult(inputText: string): AnalyzeEventResult {
  const text = inputText.toLowerCase();
  const sectors = Array.from(
    new Set(
      [
        text.includes("oil") || text.includes("gas") || text.includes("energy")
          ? "Energy"
          : "",
        text.includes("bank") || text.includes("credit") || text.includes("liquidity")
          ? "Finance"
          : "",
        text.includes("chip") || text.includes("semiconductor") || text.includes("ai")
          ? "Technology"
          : "",
        text.includes("shipping") || text.includes("port") || text.includes("freight")
          ? "Logistics"
          : "",
      ].filter(Boolean)
    )
  );
  const sentiment: AnalyzeEventResult["sentiment"] = text.includes("surge")
    ? "positive"
    : text.includes("conflict") || text.includes("sanction") || text.includes("tariff")
      ? "negative"
      : "neutral";
  const explanation = buildFallbackExplanation(inputText, {
    sentiment,
    sectors,
    relatedCountries: [],
    impactedCountries: [],
  });
  const impactChain = buildFallbackImpactChain({
    sectors,
    relatedCountries: [],
    impactedCountries: [],
  });

  return {
    ...DEFAULT_ANALYZE_EVENT_RESULT,
    sentiment,
    sectors,
    explanation,
    impactChain,
  };
}

function tryParseJsonText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // continue
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1]) as unknown;
    } catch {
      // continue
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]) as unknown;
    } catch {
      // continue
    }
  }

  return null;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.trim().replace(/\/+$/, "");
  if (!cleaned) {
    return "";
  }

  if (/\/chat\/completions$/i.test(cleaned)) {
    return cleaned;
  }

  if (/\/v1$/i.test(cleaned)) {
    return `${cleaned}/chat/completions`;
  }

  return `${cleaned}/v1/chat/completions`;
}

function parseUnknownObject(candidate: unknown): Record<string, unknown> | null {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === "string") {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parseUnknownObject(parsed);
    } catch {
      return null;
    }
  }

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const parsed = parseUnknownObject(item);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  if (typeof candidate !== "object") {
    return null;
  }

  return candidate as Record<string, unknown>;
}

function resolveStructuredSource(
  candidate: Record<string, unknown>
): Record<string, unknown> {
  const nestedMessage = parseUnknownObject(candidate.message);
  const nestedContent = parseUnknownObject(candidate.content);
  const messageContentRaw =
    nestedMessage && typeof nestedMessage.content === "string"
      ? tryParseJsonText(nestedMessage.content)
      : null;
  const messageContent = parseUnknownObject(messageContentRaw);
  const directContentRaw =
    typeof candidate.content === "string" ? tryParseJsonText(candidate.content) : null;
  const directContent = parseUnknownObject(directContentRaw);

  return (
    messageContent ??
    directContent ??
    nestedContent ??
    nestedMessage ??
    candidate
  );
}

function extractStructuredResult(raw: unknown, inputText: string): AnalyzeEventResult {
  const candidates: unknown[] = [];
  if (raw && typeof raw === "object") {
    const data = raw as Record<string, unknown>;
    candidates.push(
      data.result,
      data.analysis,
      data.output,
      data.data,
      data.choices,
      data.message,
      data.content
    );
  }
  candidates.push(raw);

  for (const candidate of candidates) {
    const parsedCandidate = parseUnknownObject(candidate);
    if (!parsedCandidate) {
      continue;
    }

    const scopedSource = resolveStructuredSource(parsedCandidate);
    const nestedScores = parseUnknownObject(scopedSource.scores ?? scopedSource.impactScores);

    const rawSentiment = scopedSource.sentiment;
    const sentiment = normalizeSentiment(rawSentiment);
    const hasAiSentiment = rawSentiment !== undefined && rawSentiment !== null;
    const sectors = normalizeStringList(
      scopedSource.sectors ?? scopedSource.sector ?? scopedSource.tags
    );
    const relatedCountries = normalizeStringList(
      scopedSource.relatedCountries ??
        scopedSource.related_countries ??
        scopedSource.relatedCountry
    );
    const impactedCountries = normalizeStringList(
      scopedSource.impactedCountries ??
        scopedSource.impacted_countries ??
        scopedSource.affectedCountries
    );
    const marketImpact = normalizeScore(
      scopedSource.marketImpact ??
        scopedSource.market_score ??
        nestedScores?.marketImpact ??
        nestedScores?.market_score ??
        nestedScores?.market
    );
    const geopoliticalImpact = normalizeScore(
      scopedSource.geopoliticalImpact ??
        scopedSource.geopolitical_score ??
        nestedScores?.geopoliticalImpact ??
        nestedScores?.geopolitical_score ??
        nestedScores?.geopolitical
    );
    const attentionScore = normalizeScore(
      scopedSource.attentionScore ??
        scopedSource.attention_score ??
        nestedScores?.attentionScore ??
        nestedScores?.attention_score ??
        nestedScores?.attention
    );
    const hasAiScores =
      scopedSource.marketImpact !== undefined ||
      scopedSource.geopoliticalImpact !== undefined ||
      scopedSource.attentionScore !== undefined ||
      scopedSource.market_score !== undefined ||
      scopedSource.geopolitical_score !== undefined ||
      scopedSource.attention_score !== undefined ||
      nestedScores?.marketImpact !== undefined ||
      nestedScores?.market_score !== undefined ||
      nestedScores?.market !== undefined ||
      nestedScores?.geopoliticalImpact !== undefined ||
      nestedScores?.geopolitical_score !== undefined ||
      nestedScores?.geopolitical !== undefined ||
      nestedScores?.attentionScore !== undefined ||
      nestedScores?.attention_score !== undefined ||
      nestedScores?.attention !== undefined;
    const hasAiTags =
      sectors.length > 0 || relatedCountries.length > 0 || impactedCountries.length > 0;
    const normalizedExplanation = normalizeExplanation(scopedSource.explanation);
    const normalizedImpactChain = normalizeImpactChain(scopedSource.impactChain);
    const explanation =
      normalizedExplanation ??
      buildFallbackExplanation(inputText, {
        sentiment,
        sectors,
        relatedCountries,
        impactedCountries,
      });
    const hasAiExplanation = Boolean(normalizedExplanation);
    const impactChain =
      normalizedImpactChain ??
      buildFallbackImpactChain({
        sectors,
        relatedCountries,
        impactedCountries,
      });
    const hasAiImpactChain = Boolean(normalizedImpactChain);

    if (process.env.NODE_ENV === "development") {
      console.debug("[analyzeEvent] score normalize", {
        raw: {
          marketImpact:
            scopedSource.marketImpact ??
            scopedSource.market_score ??
            nestedScores?.marketImpact ??
            nestedScores?.market_score ??
            nestedScores?.market,
          geopoliticalImpact:
            scopedSource.geopoliticalImpact ??
            scopedSource.geopolitical_score ??
            nestedScores?.geopoliticalImpact ??
            nestedScores?.geopolitical_score ??
            nestedScores?.geopolitical,
          attentionScore:
            scopedSource.attentionScore ??
            scopedSource.attention_score ??
            nestedScores?.attentionScore ??
            nestedScores?.attention_score ??
            nestedScores?.attention,
        },
        normalized: { marketImpact, geopoliticalImpact, attentionScore },
        explanation,
        impactChain,
        impactChainSource: hasAiImpactChain ? "ai" : "fallback",
        impactChainStepsEmpty: impactChain.steps.length === 0,
      });
    }

    if (
      hasAiTags ||
      hasAiSentiment ||
      hasAiScores ||
      hasAiExplanation ||
      hasAiImpactChain
    ) {
      return {
        sentiment,
        sectors,
        relatedCountries,
        impactedCountries,
        explanation,
        impactChain,
        marketImpact,
        geopoliticalImpact,
        attentionScore,
        hasAiSentiment,
        hasAiScores,
        hasAiTags,
        hasAiExplanation,
        hasAiImpactChain,
      };
    }
  }

  return DEFAULT_ANALYZE_EVENT_RESULT;
}

function readAiConfigFromStorage(): AiConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      provider: parsed.provider ?? "",
      apiKey: parsed.apiKey ?? "",
      baseUrl: parsed.baseUrl ?? "",
      model: parsed.model ?? "",
    };
  } catch {
    return null;
  }
}

export async function analyzeEvent(inputText: string): Promise<AnalyzeEventResult> {
  const text = inputText.trim();
  if (!text) {
    return buildFallbackAnalyzeResult(inputText);
  }

  const config = readAiConfigFromStorage();
  if (!config?.apiKey || !config.baseUrl) {
    return buildFallbackAnalyzeResult(text);
  }

  try {
    const requestUrl = buildChatCompletionsUrl(config.baseUrl);
    if (!requestUrl) {
      return buildFallbackAnalyzeResult(text);
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[analyzeEvent] request url:", requestUrl);
    }

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      ANALYZE_EVENT_TIMEOUT_MS
    );
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model || "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only. No markdown, no prose. Keys: sentiment, sectors, relatedCountries, impactedCountries, marketImpact, geopoliticalImpact, attentionScore, explanation, impactChain. explanation must be {summary:string, drivers:string[]}. impactChain must be {summary:string, steps:string[]}, and steps should contain 2-5 concise transmission steps.",
          },
          {
            role: "user",
            content: `Analyze this event text and return JSON only. sentiment must be positive|neutral|negative. Impact scores are integers 1-10. explanation.summary should be one concise sentence. explanation.drivers should contain 2-4 concrete factors. impactChain.summary should describe source-to-spillover path in one sentence. impactChain.steps should be 2-5 concise steps.\n\n${text}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 420,
      }),
    }).finally(() => {
      globalThis.clearTimeout(timeoutId);
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[analyzeEvent] request failed", {
          status: response.status,
          statusText: response.statusText,
        });
      }
      return buildFallbackAnalyzeResult(text);
    }

    const rawText = await response.text();
    if (process.env.NODE_ENV === "development") {
      console.debug("[analyzeEvent] raw response text:", rawText);
    }

    const data = tryParseJsonText(rawText);
    if (process.env.NODE_ENV === "development") {
      console.debug("[analyzeEvent] parsed response object:", data);
      console.debug("[analyzeEvent] valid json:", Boolean(data));
    }
    if (!data) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[analyzeEvent] json parse failed, using fallback");
      }
      return buildFallbackAnalyzeResult(text);
    }
    const normalized = extractStructuredResult(data, text);

    if (process.env.NODE_ENV === "development") {
      console.debug("[analyzeEvent] normalized:", normalized);
      console.debug("[analyzeEvent] has valid fields:", {
        hasAiSentiment: normalized.hasAiSentiment,
        hasAiScores: normalized.hasAiScores,
        hasAiTags: normalized.hasAiTags,
        hasAiExplanation: normalized.hasAiExplanation,
        hasAiImpactChain: normalized.hasAiImpactChain,
      });
    }

    return normalized;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[analyzeEvent] request exception, using fallback", {
        timeout: error instanceof Error && error.name === "AbortError",
        message: error instanceof Error ? error.message : "unknown-error",
      });
    }
    return buildFallbackAnalyzeResult(text);
  }
}
