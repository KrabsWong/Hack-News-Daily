/**
 * Algolia HN Search API
 */

import { get } from '../../utils/fetch';
import type { Story } from '../../types';

const ALGOLIA_BASE_URL = 'https://hn.algolia.com/api/v1';
const TIMEOUT = 10000;

interface AlgoliaHit {
  objectID: string;
  title: string;
  url?: string;
  points: number;
  created_at_i: number;
  author: string;
  num_comments?: number;
}

interface AlgoliaSearchResponse {
  hits: AlgoliaHit[];
  nbPages: number;
  nbHits: number;
}

/**
 * 获取指定日期范围内按分数排序的热门文章
 */
export async function fetchTopStoriesByScore(
  limit: number,
  startTime: number,
  endTime: number
): Promise<Story[]> {
  const filters = `created_at_i>=${startTime},created_at_i<${endTime}`;
  
  const params = new URLSearchParams({
    tags: 'story',
    numericFilters: filters,
    hitsPerPage: '1000',
  });

  const url = `${ALGOLIA_BASE_URL}/search_by_date?${params}`;
  const response = await get<AlgoliaSearchResponse>(url, { timeout: TIMEOUT });
  
  const hits = response.data.hits;
  
  // 按分数排序
  hits.sort((a, b) => b.points - a.points);
  
  // 取前 N 篇并映射为 Story 格式
  return hits.slice(0, limit).map(hit => ({
    id: parseInt(hit.objectID, 10),
    title: hit.title,
    url: hit.url,
    score: hit.points,
    time: hit.created_at_i,
    by: hit.author,
    descendants: hit.num_comments,
  }));
}

/**
 * 获取文章的评论
 */
export async function fetchCommentsFromAlgolia(
  storyId: number,
  limit: number = 3
): Promise<string> {
  const params = new URLSearchParams({
    tags: `comment,story_${storyId}`,
    hitsPerPage: limit.toString(),
  });

  const url = `${ALGOLIA_BASE_URL}/search?${params}`;
  
  try {
    const response = await get<{ hits: Array<{ comment_text?: string }> }>(url, { timeout: TIMEOUT });
    
    const comments = response.data.hits
      .filter(h => h.comment_text)
      .map(h => h.comment_text!)
      .join('\n\n---\n\n');
    
    return comments || '';
  } catch {
    return '';
  }
}

/**
 * 批量获取多篇文章的评论
 */
export async function fetchCommentsBatchFromAlgolia(
  stories: Story[],
  limit: number = 3
): Promise<string[]> {
  const results = await Promise.all(
    stories.map(s => fetchCommentsFromAlgolia(s.id, limit))
  );
  return results;
}
