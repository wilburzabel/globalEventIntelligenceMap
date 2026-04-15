export type AiConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const AI_CONFIG_STORAGE_KEY = "newmap.ai.config";

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openai",
  apiKey: "",
  baseUrl: "",
  model: "deepseek-chat",
};
