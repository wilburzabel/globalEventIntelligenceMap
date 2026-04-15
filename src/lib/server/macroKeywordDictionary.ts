export type MacroTheme = {
  id: string;
  label: string;
  weight: number;
  keywords: string[];
};

export type MatchedMacroTheme = MacroTheme & {
  matchedKeywords: string[];
  themeScore: number;
};

export const MACRO_KEYWORD_DICTIONARY: MacroTheme[] = [
  {
    id: "monetary-policy-inflation-jobs",
    label: "央行/利率/通胀/就业",
    weight: 1.55,
    keywords: [
      "央行",
      "利率",
      "通胀",
      "就业",
      "central bank",
      "interest rate",
      "inflation",
      "cpi",
      "ppi",
      "federal reserve",
      "fed",
      "ecb",
      "boj",
      "pboc",
      "jobs",
      "payroll",
    ],
  },
  {
    id: "war-conflict-strike-missile",
    label: "战争/冲突/停火/空袭/导弹",
    weight: 1.65,
    keywords: [
      "战争",
      "冲突",
      "停火",
      "空袭",
      "导弹",
      "war",
      "conflict",
      "ceasefire",
      "airstrike",
      "missile",
      "military",
      "border clash",
    ],
  },
  {
    id: "sanction-tariff-export-blacklist",
    label: "制裁/关税/出口限制/黑名单",
    weight: 1.5,
    keywords: [
      "制裁",
      "关税",
      "出口限制",
      "黑名单",
      "sanction",
      "tariff",
      "export control",
      "blacklist",
      "embargo",
      "trade restriction",
      "entity list",
    ],
  },
  {
    id: "energy-oil-gas-power-opec",
    label: "能源/原油/天然气/电力/OPEC",
    weight: 1.4,
    keywords: [
      "能源",
      "原油",
      "天然气",
      "电力",
      "opec",
      "energy",
      "oil",
      "crude",
      "brent",
      "wti",
      "gas",
      "lng",
      "electricity",
      "power grid",
    ],
  },
  {
    id: "shipping-port-redsea-panama-supplychain",
    label: "航运/港口/红海/巴拿马/供应链",
    weight: 1.35,
    keywords: [
      "航运",
      "港口",
      "红海",
      "巴拿马",
      "供应链",
      "shipping",
      "freight",
      "port",
      "red sea",
      "panama canal",
      "supply chain",
      "container",
    ],
  },
  {
    id: "commodities-metals-gold",
    label: "大宗商品/铁矿/铜/锂/稀土/黄金",
    weight: 1.3,
    keywords: [
      "大宗商品",
      "铁矿",
      "铜",
      "锂",
      "稀土",
      "黄金",
      "commodity",
      "iron ore",
      "copper",
      "lithium",
      "rare earth",
      "gold",
      "metal",
      "mining",
    ],
  },
  {
    id: "banking-credit-liquidity-debt-default",
    label: "银行/信贷/流动性/债务/违约",
    weight: 1.5,
    keywords: [
      "银行",
      "信贷",
      "流动性",
      "债务",
      "违约",
      "bank",
      "banking",
      "credit",
      "liquidity",
      "debt",
      "default",
      "funding",
      "refinancing",
    ],
  },
  {
    id: "tech-regulation-semiconductor-chip-ai-export-control",
    label: "科技监管/半导体/芯片/AI/出口管制",
    weight: 1.45,
    keywords: [
      "科技监管",
      "半导体",
      "芯片",
      "人工智能",
      "出口管制",
      "technology regulation",
      "antitrust",
      "semiconductor",
      "chip",
      "ai",
      "artificial intelligence",
      "gpu",
      "export control",
    ],
  },
  {
    id: "election-policy-fiscal-budget-deficit",
    label: "选举/政策转向/财政/预算/赤字",
    weight: 1.35,
    keywords: [
      "选举",
      "政策转向",
      "财政",
      "预算",
      "赤字",
      "election",
      "policy shift",
      "policy pivot",
      "fiscal",
      "budget",
      "deficit",
      "spending bill",
    ],
  },
];

function normalizeText(text: string): string {
  return text.toLowerCase();
}

export function matchMacroThemes(text: string): MatchedMacroTheme[] {
  const normalized = normalizeText(text);
  if (!normalized.trim()) {
    return [];
  }

  return MACRO_KEYWORD_DICTIONARY.flatMap((theme) => {
    const matchedKeywords = theme.keywords.filter((keyword) =>
      normalized.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length === 0) {
      return [];
    }

    const themeScore = Math.min(theme.weight * 1.8, theme.weight + (matchedKeywords.length - 1) * 0.32);

    return [
      {
        ...theme,
        matchedKeywords: Array.from(new Set(matchedKeywords)),
        themeScore,
      },
    ];
  });
}

export function getMacroKeywordScore(text: string): {
  score: number;
  matchedThemes: MatchedMacroTheme[];
} {
  const matchedThemes = matchMacroThemes(text);
  if (matchedThemes.length === 0) {
    return {
      score: 0,
      matchedThemes,
    };
  }

  const themeScore = matchedThemes.reduce((sum, theme) => sum + theme.themeScore, 0);
  const multiThemeBonus = Math.min(1.5, Math.max(0, matchedThemes.length - 1) * 0.45);
  const score = Math.min(6.8, themeScore + multiThemeBonus);

  return {
    score,
    matchedThemes,
  };
}
