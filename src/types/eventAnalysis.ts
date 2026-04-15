import type { EventSentiment } from "@/data/mockEvents";

export type ImpactBreakdown = {
  marketImpact: number;
  geopoliticalImpact: number;
  attentionScore: number;
};

export type EventExplanation = {
  summary: string;
  drivers: string[];
};

export type EventImpactChain = {
  summary: string;
  steps: string[];
};

export type AnalyzeEventResult = {
  sentiment: EventSentiment;
  sectors: string[];
  relatedCountries: string[];
  impactedCountries: string[];
  explanation: EventExplanation;
  impactChain: EventImpactChain;
  hasAiSentiment: boolean;
  hasAiScores: boolean;
  hasAiTags: boolean;
  hasAiExplanation: boolean;
  hasAiImpactChain: boolean;
} & ImpactBreakdown;

export function calculateImpactScore({
  marketImpact,
  geopoliticalImpact,
  attentionScore,
}: ImpactBreakdown): number {
  return marketImpact * 0.5 + geopoliticalImpact * 0.3 + attentionScore * 0.2;
}

export const DEFAULT_ANALYZE_EVENT_RESULT: AnalyzeEventResult = {
  sentiment: "neutral",
  sectors: [],
  relatedCountries: [],
  impactedCountries: [],
  explanation: {
    summary: "该事件目前信息有限，建议结合市场与地缘背景进一步跟踪。",
    drivers: ["信息不足，先观察后续官方披露与市场反应。"],
  },
  impactChain: {
    summary: "事件影响链信息有限，需结合后续国家与行业数据持续跟踪。",
    steps: [
      "源头事件触发市场关注。",
      "通过跨境预期与行业情绪向其他国家和板块传导。",
    ],
  },
  marketImpact: 5,
  geopoliticalImpact: 5,
  attentionScore: 5,
  hasAiSentiment: false,
  hasAiScores: false,
  hasAiTags: false,
  hasAiExplanation: false,
  hasAiImpactChain: false,
};
