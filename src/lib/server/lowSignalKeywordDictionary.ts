export const LOW_SIGNAL_KEYWORD_DICTIONARY = {
  entertainment: [
    "celebrity",
    "entertainment",
    "gossip",
    "showbiz",
    "movie",
    "music",
    "idol",
    "八卦",
    "明星",
    "综艺",
  ],
  clickbait: [
    "you won't believe",
    "you will not believe",
    "shocking",
    "unbelievable",
    "must see",
    "what happened next",
    "震惊",
    "你不会相信",
    "惊呆",
    "离谱",
  ],
  low_relevance: [
    "lifestyle",
    "viral",
    "viral video",
    "local crime",
    "traffic accident",
    "social media drama",
    "wedding",
    "pet",
    "campus",
    "neighborhood",
  ],
} as const;

export type LowSignalBucket = keyof typeof LOW_SIGNAL_KEYWORD_DICTIONARY;

export type LowSignalPenaltyResult = {
  totalPenalty: number;
  hitCounts: Record<LowSignalBucket, number>;
  hitKeywords: Record<LowSignalBucket, string[]>;
};

const LOW_SIGNAL_BUCKET_WEIGHTS: Record<LowSignalBucket, number> = {
  entertainment: 2.1,
  clickbait: 2.6,
  low_relevance: 1.35,
};

function countHits(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
}

export function getLowSignalPenalty(text: string): LowSignalPenaltyResult {
  const normalized = text.toLowerCase();
  const hitKeywords: Record<LowSignalBucket, string[]> = {
    entertainment: countHits(normalized, LOW_SIGNAL_KEYWORD_DICTIONARY.entertainment),
    clickbait: countHits(normalized, LOW_SIGNAL_KEYWORD_DICTIONARY.clickbait),
    low_relevance: countHits(normalized, LOW_SIGNAL_KEYWORD_DICTIONARY.low_relevance),
  };

  const hitCounts: Record<LowSignalBucket, number> = {
    entertainment: hitKeywords.entertainment.length,
    clickbait: hitKeywords.clickbait.length,
    low_relevance: hitKeywords.low_relevance.length,
  };

  const totalPenalty = Number(
    (
      Math.min(4.5, hitCounts.entertainment * LOW_SIGNAL_BUCKET_WEIGHTS.entertainment) +
      Math.min(5, hitCounts.clickbait * LOW_SIGNAL_BUCKET_WEIGHTS.clickbait) +
      Math.min(3.2, hitCounts.low_relevance * LOW_SIGNAL_BUCKET_WEIGHTS.low_relevance)
    ).toFixed(2)
  );

  return {
    totalPenalty,
    hitCounts,
    hitKeywords,
  };
}
