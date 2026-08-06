/**
 * DeepSeek LLM Provider
 */

import { post } from '../../utils/fetch';
import { LLMError } from '../../types';
import type { LLMProvider, ChatMessage, ChatCompletionResponse } from '../../types';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_TIMEOUT = 30000;
const DEEPSEEK_WEB_SEARCH_TIMEOUT = 60000;

interface DeepSeekResponsesResult {
  status?: string;
  output?: Array<{
    type?: string;
    status?: string;
    action?: {
      url?: string;
    };
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface UrlSummaryResult {
  summary: string;
  source: 'original' | 'alternative';
  sourceUrls: string[];
}

function sanitizeSourceUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }

    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      const isTrackingParameter = normalizedKey.startsWith('utm_') ||
        ['fbclid', 'gclid', 'ref', 'referrer', 'source'].includes(normalizedKey);
      if (isTrackingParameter) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeSourceUrl(rawUrl: string): string | null {
  const sanitizedUrl = sanitizeSourceUrl(rawUrl);
  if (!sanitizedUrl) {
    return null;
  }

  try {
    const parsed = new URL(sanitizedUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const query = parsed.searchParams.toString();
    return `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ''}${pathname}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
}

function getOutputText(item: NonNullable<DeepSeekResponsesResult['output']>[number]): string {
  return (item.content || [])
    .filter(part => part.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text!)
    .join('')
    .trim();
}

export function parseUrlSummaryResponse(
  response: DeepSeekResponsesResult | undefined,
  targetUrl: string
): UrlSummaryResult | null {
  const output = response?.output;
  if (response?.status !== 'completed' || !Array.isArray(output)) {
    return null;
  }

  const normalizedTargetUrl = normalizeSourceUrl(targetUrl);
  if (!normalizedTargetUrl) {
    return null;
  }

  const completedPageUrls = output
    .filter(item =>
      item.type === 'web_search_call' &&
      item.status === 'completed' &&
      typeof item.action?.url === 'string'
    )
    .map(item => sanitizeSourceUrl(item.action!.url!))
    .filter((url): url is string => Boolean(url));

  const originalWasAttempted = output.some(item =>
    item.type === 'web_search_call' &&
    typeof item.action?.url === 'string' &&
    normalizeSourceUrl(item.action.url) === normalizedTargetUrl
  );
  const originalWasOpened = completedPageUrls.some(url =>
    normalizeSourceUrl(url) === normalizedTargetUrl
  );
  const alternativeUrls = [...new Map(
    completedPageUrls
      .filter(url => normalizeSourceUrl(url) !== normalizedTargetUrl)
      .map(url => [normalizeSourceUrl(url), url] as const)
  ).values()].slice(0, 3);

  const finalText = output
    .filter(item => item.type === 'message')
    .map(getOutputText)
    .filter(Boolean)
    .at(-1);
  if (!finalText || finalText.includes('CONTENT_UNAVAILABLE')) {
    return null;
  }

  const alternativeMatch = finalText.match(/(?:^|\n)\s*ALTERNATIVE_SUMMARY\s*[:：]\s*([\s\S]+)$/i);
  if (
    originalWasAttempted &&
    !originalWasOpened &&
    alternativeUrls.length > 0 &&
    alternativeMatch?.[1]?.trim()
  ) {
    return {
      summary: alternativeMatch[1].trim(),
      source: 'alternative',
      sourceUrls: alternativeUrls,
    };
  }

  const originalMatch = finalText.match(/(?:^|\n)\s*SUMMARY\s*[:：]\s*([\s\S]+)$/i);
  if (originalWasOpened && originalMatch?.[1]?.trim()) {
    return {
      summary: originalMatch[1].trim(),
      source: 'original',
      sourceUrls: [],
    };
  }

  return null;
}

export class DeepSeekProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getName(): string {
    return 'deepseek';
  }

  getModel(): string {
    return DEEPSEEK_MODEL;
  }

  async chatCompletion(messages: ChatMessage[], temperature: number = 0.3): Promise<ChatCompletionResponse> {
    const body = {
      model: DEEPSEEK_MODEL,
      input: messages,
      reasoning: { effort: 'none' },
      temperature,
      max_output_tokens: 4096,
    };

    try {
      const response = await post<DeepSeekResponsesResult>(`${DEEPSEEK_BASE_URL}/responses`, body, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: DEEPSEEK_TIMEOUT,
      });

      const content = response.data?.output
        ?.filter(item => item.type === 'message')
        .flatMap(item => item.content || [])
        .filter(part => part.type === 'output_text' && typeof part.text === 'string')
        .map(part => part.text!)
        .join('')
        .trim();

      if (response.data?.status !== 'completed' || !content) {
        throw new LLMError('Empty response from DeepSeek');
      }

      const usage = response.data.usage;
      return {
        content,
        ...(usage &&
          typeof usage.input_tokens === 'number' &&
          typeof usage.output_tokens === 'number' &&
          typeof usage.total_tokens === 'number'
          ? {
              usage: {
                prompt_tokens: usage.input_tokens,
                completion_tokens: usage.output_tokens,
                total_tokens: usage.total_tokens,
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `DeepSeek Responses API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 通过 DeepSeek Responses API 的服务端 Web Search 读取并总结指定外链。
   * 原文优先；原文失败时，只有确认备选页面已成功打开才采用备选摘要。
   */
  async summarizeUrl(
    url: string,
    title: string,
    maxLength: number = 300
  ): Promise<UrlSummaryResult | null> {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new LLMError(`Unsupported article URL protocol: ${parsedUrl.protocol}`);
    }

    const body = {
      model: DEEPSEEK_MODEL,
      instructions: [
        '你是技术文章摘要助手。',
        '必须先使用 Web Search 读取用户给出的精确 URL，不得仅凭标题、搜索片段、常识或模型记忆生成内容。',
        '如果精确 URL 打开成功，只能根据该页面正文生成摘要，并以“SUMMARY:”开头。',
        '如果精确 URL 打开失败，可以搜索并打开直接报道同一事件或主题的相关网页。只有至少一个备选网页成功打开且正文足以确认内容时，才可生成备选摘要，并以“ALTERNATIVE_SUMMARY:”开头。',
        '备选摘要必须综合已成功打开的相关网页，不得把搜索结果列表或未打开网页当作正文。',
        '如果原始链接与备选网页都没有可读正文，或信息不足以确认内容，只返回 CONTENT_UNAVAILABLE。',
        '最终内容会直接展示给读者。严禁提及 DeepSeek、Web Search、工具调用、读取网页、验证链接、HN 帖子存在性、思考过程或生成摘要的过程。',
        '使用2至4句客观、自然、连贯的中文，先说明文章主题，再概括关键做法与结果；避免机械罗列次要参数。',
        '不使用“我”“我们”“已成功读取”“现在可以生成摘要”等第一人称或过程性表达。',
        `成功时在指定标记后只写中文纯文本摘要，不使用 Markdown，不超过 ${Math.max(1, Math.floor(maxLength))} 字。`,
      ].join('\n'),
      input: `文章标题：${title}\n文章 URL：${url}`,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      reasoning: { effort: 'none' },
      temperature: 0.2,
      max_output_tokens: 1024,
      max_tool_calls: 5,
    };

    try {
      const response = await post<DeepSeekResponsesResult>(
        `${DEEPSEEK_BASE_URL}/responses`,
        body,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: DEEPSEEK_WEB_SEARCH_TIMEOUT,
        }
      );

      return parseUrlSummaryResponse(response.data, url);
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      throw new LLMError(
        `DeepSeek Web Search error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
