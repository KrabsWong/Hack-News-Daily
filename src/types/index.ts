/**
 * 类型定义
 */

// LLM 相关类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMProvider {
  getName(): string;
  getModel(): string;
  chatCompletion(messages: ChatMessage[], temperature?: number): Promise<ChatCompletionResponse>;
}

// 错误类型
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

export class FetchError extends Error {
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FetchError';
  }
}

// API 类型
export interface Story {
  id: number;
  title: string;
  url?: string;
  score: number;
  time: number;
  by: string;
  descendants?: number;
}

// 处理后的文章
export type DescriptionSource = 'original' | 'alternative' | 'unavailable' | 'no-external-link';

export interface ProcessedStory {
  rank: number;
  storyId: number;
  titleEnglish: string;
  titleChinese: string;
  url: string;
  score: number;
  time: string;
  timestamp: number;
  description: string;
  descriptionSource: DescriptionSource;
  descriptionSourceUrls: string[];
  commentSummary: string | null;
}
