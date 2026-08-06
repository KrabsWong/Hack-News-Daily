const test = require('node:test');
const assert = require('node:assert/strict');

const { parseUrlSummaryResponse } = require('../dist/services/llm/deepseek.js');

const targetUrl = 'https://www.example.com/articles/story';

function openPage(status, url) {
  return {
    type: 'web_search_call',
    status,
    action: { url },
  };
}

function message(text) {
  return {
    type: 'message',
    status: 'completed',
    content: [{ type: 'output_text', text }],
  };
}

test('accepts a summary only when the original URL was opened', () => {
  const result = parseUrlSummaryResponse({
    status: 'completed',
    output: [
      openPage('completed', `${targetUrl}?utm_source=hn#ws_call_id=one`),
      message('SUMMARY:原文摘要'),
    ],
  }, targetUrl);

  assert.deepEqual(result, {
    summary: '原文摘要',
    source: 'original',
    sourceUrls: [],
  });
});

test('accepts a marked alternative summary and sanitizes opened source URLs', () => {
  const result = parseUrlSummaryResponse({
    status: 'completed',
    output: [
      openPage('failed', `${targetUrl}#ws_call_id=original`),
      openPage('completed', 'https://news.example/a?utm_campaign=test#ws_call_id=a'),
      openPage('completed', 'https://news.example/a#ws_call_id=duplicate'),
      openPage('completed', 'https://second.example/b#ws_call_id=b'),
      openPage('completed', 'https://third.example/c#ws_call_id=c'),
      openPage('completed', 'https://fourth.example/d#ws_call_id=d'),
      message('原始链接无法打开，但备选网页已确认。\n\nALTERNATIVE_SUMMARY:备选摘要'),
    ],
  }, targetUrl);

  assert.deepEqual(result, {
    summary: '备选摘要',
    source: 'alternative',
    sourceUrls: [
      'https://news.example/a',
      'https://second.example/b',
      'https://third.example/c',
    ],
  });
});

test('rejects an alternative summary without a matching marker', () => {
  const result = parseUrlSummaryResponse({
    status: 'completed',
    output: [
      openPage('failed', targetUrl),
      openPage('completed', 'https://news.example/a'),
      message('SUMMARY:来源状态不一致'),
    ],
  }, targetUrl);

  assert.equal(result, null);
});

test('rejects marked fallback text without a successfully opened alternative page', () => {
  const result = parseUrlSummaryResponse({
    status: 'completed',
    output: [
      openPage('failed', targetUrl),
      openPage('failed', 'https://news.example/a'),
      message('ALTERNATIVE_SUMMARY:没有页面证据'),
    ],
  }, targetUrl);

  assert.equal(result, null);
});

test('rejects alternative sources when the original URL was never attempted', () => {
  const result = parseUrlSummaryResponse({
    status: 'completed',
    output: [
      openPage('completed', 'https://news.example/a'),
      message('ALTERNATIVE_SUMMARY:没有尝试原文'),
    ],
  }, targetUrl);

  assert.equal(result, null);
});
