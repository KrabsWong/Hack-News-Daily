/**
 * Markdown 导出服务
 */

import { formatDateForDisplay } from '../utils/date';
import type { ProcessedStory } from '../types';

const DEFAULT_DESCRIPTION = '暂无描述';
const DEFAULT_COMMENT_SUMMARY = '暂无评论';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeMarkdownText(value: string): string {
  return escapeHtml(value).replace(/([\\`*_[\]{}()#+.!|>~-])/g, '\\$1');
}

function getAlternativeSource(url: string): { url: string; label: string; description: string | null } | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }

    const lastPathSegment = parsed.pathname.split('/').filter(Boolean).pop();
    const decodedPath = lastPathSegment ? decodeURIComponent(lastPathSegment) : '';
    const readablePath = decodedPath
      .replace(/\.(?:html?|php|aspx?)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const pathDescription = /[a-z\u4e00-\u9fff]/i.test(readablePath)
      ? `${readablePath.charAt(0).toUpperCase()}${readablePath.slice(1)}`
      : '';

    return {
      url: parsed.toString(),
      label: parsed.hostname.toLowerCase().replace(/^www\./, ''),
      description: pathDescription.length > 110
        ? `${pathDescription.slice(0, 107)}…`
        : pathDescription || null,
    };
  } catch {
    return null;
  }
}

function generateAlternativeSourceNotice(story: ProcessedStory): string {
  const sources = story.descriptionSourceUrls
    .map(getAlternativeSource)
    .filter((source): source is { url: string; label: string; description: string | null } => Boolean(source))
    .slice(0, 3);
  const titleId = `summary-source-${story.storyId}`;
  const noticeStart = `<aside class="summary-provenance summary-provenance--alternative" data-summary-source="alternative" aria-labelledby="${titleId}">`;

  if (sources.length === 0) {
    return [
      noticeStart,
      `  <em class="summary-provenance__status" id="${titleId}">原文不可用</em>`,
      '</aside>',
    ].join('\n');
  }

  return [
    noticeStart,
    '  <details class="summary-provenance__details">',
    '    <summary>',
    `      <em class="summary-provenance__status" id="${titleId}">原文不可用，<span class="summary-provenance__action">查看 ${sources.length} 个备选来源</span></em>`,
    '    </summary>',
    '    <ul class="summary-provenance__sources" aria-label="备选信息来源">',
    ...sources.flatMap(source => [
      `      <li><a href="${escapeHtml(source.url)}">`,
      `        <span class="summary-provenance__source-name">${escapeHtml(source.label)}<span aria-hidden="true">↗</span></span>`,
      ...(source.description
        ? [`        <span class="summary-provenance__source-description">${escapeHtml(source.description)}</span>`]
        : []),
      '      </a></li>',
    ]),
    '    </ul>',
    '  </details>',
    '</aside>',
  ].join('\n');
}

function generateJekyllFrontMatter(date: Date): string {
  const dateStr = formatDateForDisplay(date);
  return `---
layout: post
title: HackerNews Daily - ${dateStr}
date: ${dateStr}
---

`;
}

export function generateMarkdownContent(stories: ProcessedStory[], date: Date): string {
  let content = generateJekyllFrontMatter(date);
  
  for (const story of stories) {
    content += `## ${story.titleChinese}\n\n`;
    content += `${story.titleEnglish}\n\n`;
    content += `**发布时间**: ${story.time}\n\n`;
    content += `**链接**: [${story.url}](${story.url})\n\n`;
    
    const desc = story.description?.trim() || DEFAULT_DESCRIPTION;
    if (story.descriptionSource === 'alternative') {
      const sourceNotice = generateAlternativeSourceNotice(story)
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
      content += '<div class="description-heading description-heading--alternative">\n';
      content += '  <strong>描述：</strong>\n';
      content += `${sourceNotice}\n`;
      content += '</div>\n\n';
    } else {
      content += '**描述**:\n\n';
    }
    content += `${escapeMarkdownText(desc)}\n\n`;
    
    const comments = story.commentSummary?.trim() || DEFAULT_COMMENT_SUMMARY;
    content += `**评论要点**:\n\n${comments}\n\n`;
    
    content += `*[HackerNews](https://news.ycombinator.com/item?id=${story.storyId})*\n\n`;
    content += `---\n\n`;
  }
  
  return content;
}

export function generateFilename(date: Date): string {
  return `${formatDateForDisplay(date)}-daily.md`;
}

export { formatDateForDisplay };
