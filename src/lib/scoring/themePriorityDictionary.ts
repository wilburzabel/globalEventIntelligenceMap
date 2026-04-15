import type { EventItem } from "@/data/mockEvents";

export type ThemePriorityCategory = {
  id: string;
  label: string;
  priorityWeight: number;
  keywords: string[];
};

export type MatchedPriorityTheme = ThemePriorityCategory & {
  matchedKeywords: string[];
};

export const THEME_PRIORITY_DICTIONARY: ThemePriorityCategory[] = [
  {
    id: "monetary-policy-macro",
    label: "央行/利率/通胀/就业",
    priorityWeight: 2.8,
    keywords: [
      "央行",
      "利率",
      "通胀",
      "就业",
      "central bank",
      "interest rate",
      "inflation",
      "employment",
      "jobs",
      "cpi",
      "ppi",
      "federal reserve",
      "fed",
      "ecb",
      "boj",
      "pboc",
    ],
  },
  {
    id: "war-conflict-trade-restrictions",
    label: "战争/冲突/制裁/关税/出口限制",
    priorityWeight: 3.2,
    keywords: [
      "战争",
      "冲突",
      "制裁",
      "关税",
      "出口限制",
      "war",
      "conflict",
      "ceasefire",
      "sanction",
      "tariff",
      "export control",
      "trade restriction",
      "embargo",
    ],
  },
  {
    id: "energy-oil-gas-power",
    label: "能源/原油/天然气/电力",
    priorityWeight: 2.6,
    keywords: [
      "能源",
      "原油",
      "天然气",
      "电力",
      "energy",
      "oil",
      "crude",
      "brent",
      "wti",
      "gas",
      "lng",
      "power grid",
      "electricity",
    ],
  },
  {
    id: "shipping-ports-supply-chain",
    label: "航运/港口/供应链",
    priorityWeight: 2.4,
    keywords: [
      "航运",
      "港口",
      "供应链",
      "shipping",
      "freight",
      "port",
      "container",
      "supply chain",
      "logistics",
    ],
  },
  {
    id: "commodities-mining",
    label: "大宗商品/铁矿/铜/锂/稀土",
    priorityWeight: 2.5,
    keywords: [
      "大宗商品",
      "铁矿",
      "铜",
      "锂",
      "稀土",
      "commodity",
      "iron ore",
      "copper",
      "lithium",
      "rare earth",
      "metal",
      "mining",
    ],
  },
  {
    id: "tech-regulation-chip-ai",
    label: "科技监管/芯片/AI",
    priorityWeight: 2.7,
    keywords: [
      "科技监管",
      "芯片",
      "人工智能",
      "technology regulation",
      "antitrust",
      "semiconductor",
      "chip",
      "ai",
      "artificial intelligence",
      "gpu",
    ],
  },
  {
    id: "banking-credit-liquidity-debt",
    label: "银行/信用/流动性/债务",
    priorityWeight: 2.9,
    keywords: [
      "银行",
      "信用",
      "流动性",
      "债务",
      "bank",
      "banking",
      "credit",
      "liquidity",
      "debt",
      "default",
      "funding",
    ],
  },
  {
    id: "election-policy-shift",
    label: "选举/政策转向",
    priorityWeight: 2.3,
    keywords: [
      "选举",
      "政策转向",
      "election",
      "ballot",
      "policy pivot",
      "policy shift",
      "regulatory shift",
    ],
  },
];

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toSearchText(event: EventItem): string {
  return [
    safeText(event.title),
    safeText(event.summary),
    safeArray(event.sectors).join(" "),
    safeArray(event.modeTags).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

export function matchPriorityThemes(event: EventItem): MatchedPriorityTheme[] {
  const text = toSearchText(event);
  if (!text) {
    return [];
  }

  return THEME_PRIORITY_DICTIONARY.flatMap((theme) => {
    const matchedKeywords = theme.keywords.filter((keyword) =>
      text.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length === 0) {
      return [];
    }

    return [{ ...theme, matchedKeywords: Array.from(new Set(matchedKeywords)) }];
  });
}

export function getThemePriorityScore(event: EventItem): number {
  const matchedThemes = matchPriorityThemes(event);
  if (matchedThemes.length === 0) {
    return 0;
  }

  const rawScore = matchedThemes.reduce(
    (total, theme) => total + theme.priorityWeight,
    0
  );
  return Math.min(rawScore, 8.5);
}
