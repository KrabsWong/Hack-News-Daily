/**
 * 极简每日导出脚本
 * 
 * 使用 Hacker News API 获取数据 + DeepSeek 读取外链、翻译和摘要
 */

import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '../../.env') });

import { fetchTopStoriesByScore, fetchCommentsBatchFromAlgolia } from '../api';
import { translator } from '../services/translator';
import { generateMarkdownContent } from '../services/markdownExporter';
import { formatDateForDisplay, getDayBoundaries, getPreviousDayBoundaries } from '../utils/date';
import type { ProcessedStory } from '../types';

const STORY_LIMIT = parseInt(process.env.HN_STORY_LIMIT || '30', 10);
const SUMMARY_MAX_LENGTH = parseInt(process.env.SUMMARY_MAX_LENGTH || '300', 10);

export interface DailyExportOutput {
  processedStories: ProcessedStory[];
  markdown: string;
  date: string;
  sourceDate: string;
  contentSuccess: number;
  originalContentCount: number;
  alternativeContentCount: number;
  unavailableContentCount: number;
}

export async function generateDailyExport(
  deepseekApiKey: string,
  storyLimit: number = STORY_LIMIT,
  summaryMaxLength: number = SUMMARY_MAX_LENGTH
): Promise<DailyExportOutput | null> {
  // 1. 获取文章列表
  console.log('\n[1/3] 📥 获取 HackerNews 文章...');
  const targetDate = process.env.HN_TARGET_DATE?.trim();
  const { start, end } = targetDate
    ? getDayBoundaries(targetDate)
    : getPreviousDayBoundaries();
  const sourceDate = targetDate || formatDateForDisplay(new Date(start * 1000));
  console.log(`  数据日期: ${sourceDate} (UTC)`);
  const stories = await fetchTopStoriesByScore(storyLimit, start, end);
  console.log(`✓ 获取 ${stories.length} 篇文章`);

  if (stories.length === 0) {
    return null;
  }

  // 2. 获取评论
  console.log('\n[2/3] 💬 获取评论...');
  const commentsBatch = await fetchCommentsBatchFromAlgolia(stories, 3);
  console.log('✓ 评论获取完成');

  // 3. DeepSeek 读取外链、翻译和摘要
  console.log('\n[3/3] 🤖 DeepSeek 读取外链、翻译和摘要...');
  translator.init({ apiKey: deepseekApiKey });

  console.log('  翻译标题...');
  const titlesZh = await translator.translateTitles(stories.map(s => s.title));

  console.log('  读取外链并生成内容摘要...');
  const contentSummaries = await translator.summarizeUrls(
    stories.map(story => ({ title: story.title, url: story.url })),
    summaryMaxLength
  );
  const originalContentCount = contentSummaries.filter(summary => summary.source === 'original').length;
  const alternativeContentCount = contentSummaries.filter(summary => summary.source === 'alternative').length;
  const unavailableContentCount = contentSummaries.length - originalContentCount - alternativeContentCount;
  const contentSuccess = originalContentCount + alternativeContentCount;

  console.log('  生成评论摘要...');
  const commentSummaries = await translator.summarizeComments(
    commentsBatch,
    summaryMaxLength
  );
  console.log('✓ LLM 处理完成');

  const processedStories: ProcessedStory[] = stories.map((story, i) => ({
    rank: i + 1,
    storyId: story.id,
    titleEnglish: story.title,
    titleChinese: titlesZh[i] || story.title,
    url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
    score: story.score,
    time: formatDateForDisplay(new Date(story.time * 1000)),
    timestamp: story.time * 1000,
    description: contentSummaries[i]?.description || '暂无摘要',
    descriptionSource: contentSummaries[i]?.source || 'unavailable',
    descriptionSourceUrls: contentSummaries[i]?.sourceUrls || [],
    commentSummary: commentSummaries[i] || null,
  }));

  const date = sourceDate;
  const markdownDate = new Date(`${date}T00:00:00.000Z`);

  return {
    processedStories,
    markdown: generateMarkdownContent(processedStories, markdownDate),
    date,
    sourceDate,
    contentSuccess,
    originalContentCount,
    alternativeContentCount,
    unavailableContentCount,
  };
}

async function main() {
  const startTime = Date.now();
  
  console.log('='.repeat(60));
  console.log('🚀 HackerNews Daily Export');
  console.log(`时间: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // 检查环境变量
  const deepseekApiKey = process.env.LLM_DEEPSEEK_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const targetRepo = process.env.TARGET_REPO;

  if (!deepseekApiKey) {
    console.error('❌ 未设置 LLM_DEEPSEEK_API_KEY');
    process.exit(1);
  }
  if (!githubToken || !targetRepo) {
    console.error('❌ 未设置 GITHUB_TOKEN 或 TARGET_REPO');
    process.exit(1);
  }

  try {
    const output = await generateDailyExport(deepseekApiKey);
    if (!output) {
      console.log('⚠️  无文章，退出');
      return;
    }

    const {
      processedStories,
      markdown,
      date,
      sourceDate,
      contentSuccess,
      originalContentCount,
      alternativeContentCount,
      unavailableContentCount,
    } = output;

    console.log('\n[4/4] 📝 发布...');

    // 发布到 GitHub
    console.log('  发布到 GitHub...');
    await pushToGitHub(markdown, date, {
      GITHUB_TOKEN: githubToken,
      TARGET_REPO: targetRepo,
      TARGET_BRANCH: process.env.TARGET_BRANCH || 'main',
    });
    console.log(`  ✓ GitHub 发布成功`);

    // 发布到 Telegram（可选）
    if (process.env.TELEGRAM_ENABLED === 'true') {
      console.log('  发布到 Telegram...');
      try {
        await publishToTelegram(markdown, date, processedStories);
        console.log(`  ✓ Telegram 发布成功`);
      } catch (error) {
        console.error('  ⚠️  Telegram 发布失败:', error);
      }
    }

    // 完成
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 完成！耗时: ${duration}s`);
    console.log(`   数据日期: ${sourceDate} (UTC)`);
    console.log(`   文章: ${processedStories.length} 篇`);
    console.log(`   摘要可用: ${contentSuccess}/${processedStories.length}`);
    console.log(`   原文摘要: ${originalContentCount}`);
    console.log(`   备选来源摘要: ${alternativeContentCount}`);
    console.log(`   无可用内容: ${unavailableContentCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 执行失败:', error);
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

async function pushToGitHub(
  markdown: string,
  dateStr: string,
  config: { GITHUB_TOKEN: string; TARGET_REPO: string; TARGET_BRANCH: string }
): Promise<void> {
  const path = `_posts/${dateStr}-daily.md`;
  const url = `https://api.github.com/repos/${config.TARGET_REPO}/contents/${path}`;
  
  let sha: string | undefined;
  try {
    const checkRes = await fetch(url, {
      headers: { 'Authorization': `token ${config.GITHUB_TOKEN}` },
    });
    if (checkRes.ok) {
      const data = await checkRes.json() as { sha: string };
      sha = data.sha;
    }
  } catch {
    // 文件不存在
  }

  const body = {
    message: `Add HackerNews daily for ${dateStr}`,
    content: Buffer.from(markdown).toString('base64'),
    branch: config.TARGET_BRANCH,
    ...(sha && { sha }),
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${config.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} - ${err}`);
  }
}

async function publishToTelegram(
  _markdown: string,
  dateStr: string,
  stories: ProcessedStory[]
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!botToken || !channelId) {
    throw new Error('Telegram 配置缺失');
  }

  const targetBranch = process.env.TARGET_BRANCH || 'main';
  const text = `📰 <b>HackerNews Daily - ${dateStr}</b>\n\n共 ${stories.length} 篇文章\n\n查看详情: https://github.com/${process.env.TARGET_REPO}/blob/${targetBranch}/_posts/${dateStr}-daily.md`;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: channelId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${res.status} - ${err}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

export { main };
