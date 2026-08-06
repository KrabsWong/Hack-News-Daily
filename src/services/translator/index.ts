/**
 * Translator Service
 */

import { DeepSeekProvider } from '../llm';
import type { ChatMessage, DescriptionSource } from '../../types';

export interface TranslatorConfig {
  apiKey: string;
}

export const NO_EXTERNAL_LINK_DESCRIPTION = '无法获取文章内容：该 Hacker News 帖子没有外链地址。';
export const EXTERNAL_CONTENT_UNAVAILABLE_DESCRIPTION = '无法获取文章内容：该外链无法访问或没有可用正文。';

export interface ContentSummary {
  description: string;
  source: DescriptionSource;
  sourceUrls: string[];
}

const PROCESS_NARRATION_PATTERNS = [
  /(?:通过|使用|调用|借助).*(?:DeepSeek|Web\s*Search|网页搜索|搜索工具|工具调用).*(?:读取|访问|搜索|检索|确认|获取|生成)/i,
  /(?:DeepSeek|Web\s*Search|网页搜索|搜索工具|工具调用).*(?:已|成功|完成|读取|访问|搜索|检索|确认|获取|生成)/i,
  /^(?:我|我们|模型|助手).*(?:读取|访问|打开|搜索|检索|确认|获取|调用|生成|撰写|输出|摘要|总结)/,
  /^(?:现在|接下来|随后).*(?:生成|整理|撰写|输出|摘要|总结)/,
  /^(?:已经|已|成功).*(?:读取|访问|打开|搜索|检索|确认|获取)/,
  /^(?:以下|下面)(?:是|为).*(?:摘要|总结)/,
  /^(?:摘要|总结)(?:需|应|应该|需要)/,
];

function cleanSummaryText(rawText: string): string {
  let text = rawText
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/, '');

  const markedSummary = text.match(/(?:^|\n)\s*(?:FINAL_)?SUMMARY\s*[:：]\s*([\s\S]+)$/i);
  if (markedSummary) {
    text = markedSummary[1];
  }

  const paragraphs = text
    .split(/\n+/)
    .map(paragraph => paragraph
      .split(/(?<=[。！？!?])\s*/u)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence && !PROCESS_NARRATION_PATTERNS.some(pattern => pattern.test(sentence)))
      .join('')
    )
    .filter(Boolean);

  return paragraphs
    .join('\n\n')
    .replace(/^(?:文章|内容)?(?:摘要|总结)\s*[:：]\s*/, '')
    .trim();
}

export class Translator {
  private provider: DeepSeekProvider | null = null;

  init(config: TranslatorConfig): void {
    this.provider = new DeepSeekProvider(config.apiKey);
  }

  /**
   * 批量翻译标题
   */
  async translateTitles(titles: string[]): Promise<string[]> {
    if (!this.provider) {
      throw new Error('Translator not initialized');
    }

    const results: string[] = [];

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      console.log(`  [${i + 1}/${titles.length}] 翻译标题...`);

      try {
        const response = await this.provider.chatCompletion([
          {
            role: 'system',
            content: '你是一个专业的技术翻译。请将用户提供的英文标题翻译成简洁的中文。只返回翻译结果。',
          },
          { role: 'user', content: title },
        ], 0.3);

        results.push(response.content.trim());
      } catch (error) {
        console.warn(`  ⚠️  翻译失败: ${error}`);
        results.push(title);
      }
    }

    return results;
  }

  /**
   * 使用 DeepSeek Web Search 读取原文或已验证的备选来源并生成摘要
   */
  async summarizeUrls(
    articles: Array<{ title: string; url?: string }>,
    maxLength: number = 300
  ): Promise<ContentSummary[]> {
    if (!this.provider) {
      throw new Error('Translator not initialized');
    }

    const results: ContentSummary[] = [];

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.log(`  [${i + 1}/${articles.length}] 读取外链并生成摘要...`);

      if (!article.url) {
        results.push({
          description: NO_EXTERNAL_LINK_DESCRIPTION,
          source: 'no-external-link',
          sourceUrls: [],
        });
        continue;
      }

      try {
        const result = await this.provider.summarizeUrl(
          article.url,
          article.title,
          maxLength
        );
        if (result) {
          const cleanedSummary = cleanSummaryText(result.summary);
          if (cleanedSummary) {
            results.push({
              description: cleanedSummary,
              source: result.source,
              sourceUrls: result.sourceUrls,
            });
            continue;
          }
        }

        results.push({
          description: EXTERNAL_CONTENT_UNAVAILABLE_DESCRIPTION,
          source: 'unavailable',
          sourceUrls: [],
        });
      } catch (error) {
        console.warn(`  ⚠️  外链读取失败: ${error}`);
        results.push({
          description: EXTERNAL_CONTENT_UNAVAILABLE_DESCRIPTION,
          source: 'unavailable',
          sourceUrls: [],
        });
      }
    }

    return results;
  }

  /**
   * 批量摘要评论
   */
  async summarizeComments(
    commentsBatch: string[],
    maxLength: number = 300
  ): Promise<(string | null)[]> {
    if (!this.provider) {
      throw new Error('Translator not initialized');
    }

    const results: (string | null)[] = [];

    for (let i = 0; i < commentsBatch.length; i++) {
      const comments = commentsBatch[i];
      console.log(`  [${i + 1}/${commentsBatch.length}] 生成评论摘要...`);

      if (!comments || comments.trim().length === 0) {
        results.push(null);
        continue;
      }

      try {
        const response = await this.provider.chatCompletion([
          {
            role: 'system',
            content: `你是中文编辑。请用2至4句自然、客观的中文直接归纳评论中的观点和分歧，控制在${maxLength}字以内。不要描述总结过程，不使用“评论主要围绕”“核心观点是”“摘要需要”等套话，只返回可直接展示的正文。`,
          },
          { role: 'user', content: comments.substring(0, 3000) },
        ], 0.3);

        const cleanedSummary = cleanSummaryText(response.content);
        results.push(cleanedSummary || null);
      } catch (error) {
        console.warn(`  ⚠️  评论摘要失败: ${error}`);
        results.push(null);
      }
    }

    return results;
  }
}

export const translator = new Translator();
