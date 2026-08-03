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

function normalizeSourceUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    for (const key of [...parsed.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      const isTrackingParameter = normalizedKey.startsWith('utm_') ||
        ['fbclid', 'gclid', 'ref', 'referrer', 'source'].includes(normalizedKey);
      if (isTrackingParameter) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    const query = parsed.searchParams.toString();
    return `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ''}${pathname}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
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
   * 只有确认目标 URL 已成功打开且随后返回摘要时才采用结果。
   */
  async summarizeUrl(
    url: string,
    title: string,
    maxLength: number = 300
  ): Promise<string | null> {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new LLMError(`Unsupported article URL protocol: ${parsedUrl.protocol}`);
    }

    const body = {
      model: DEEPSEEK_MODEL,
      instructions: [
        '你是技术文章摘要助手。',
        '必须使用 Web Search 读取用户给出的精确 URL，不得仅凭标题、常识或模型记忆生成内容。',
        '最多调用 3 次 Web Search；如果仍无法读取目标 URL，立即返回 CONTENT_UNAVAILABLE。',
        '如果链接无法访问、没有可读正文或搜索结果不足以确认文章内容，只返回 CONTENT_UNAVAILABLE。',
        '最终内容会直接展示给读者。严禁提及 DeepSeek、Web Search、工具调用、读取网页、验证链接、HN 帖子存在性、思考过程或生成摘要的过程。',
        '使用2至4句客观、自然、连贯的中文，先说明文章主题，再概括关键做法与结果；避免机械罗列次要参数。',
        '不使用“我”“我们”“已成功读取”“现在可以生成摘要”等第一人称或过程性表达。',
        `成功时最终答案必须以“SUMMARY:”开头，之后只写中文纯文本摘要，不使用 Markdown，不超过 ${Math.max(1, Math.floor(maxLength))} 字。`,
      ].join('\n'),
      input: `文章标题：${title}\n文章 URL：${url}`,
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      reasoning: { effort: 'none' },
      temperature: 0.2,
      max_output_tokens: 1024,
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

      const output = response.data?.output;
      if (response.data?.status !== 'completed' || !Array.isArray(output)) {
        return null;
      }

      const normalizedTargetUrl = normalizeSourceUrl(url);
      const targetReadIndex = output.findIndex(item =>
        item.type === 'web_search_call' &&
        item.status === 'completed' &&
        typeof item.action?.url === 'string' &&
        normalizeSourceUrl(item.action.url) === normalizedTargetUrl
      );
      if (targetReadIndex < 0) {
        return null;
      }

      const summary = output
        .slice(targetReadIndex + 1)
        .filter(item => item.type === 'message')
        .map(item => (item.content || [])
          .filter(part => part.type === 'output_text' && typeof part.text === 'string')
          .map(part => part.text!)
          .join('')
          .trim()
        )
        .filter(Boolean)
        .at(-1);

      if (!summary || summary.includes('CONTENT_UNAVAILABLE')) {
        return null;
      }

      return summary;
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
