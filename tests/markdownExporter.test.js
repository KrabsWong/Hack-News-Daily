const test = require('node:test');
const assert = require('node:assert/strict');

const { generateMarkdownContent } = require('../dist/services/markdownExporter.js');

function story(overrides = {}) {
  return {
    rank: 1,
    storyId: 123,
    titleEnglish: 'Example title',
    titleChinese: '示例标题',
    url: 'https://original.example/story',
    score: 100,
    time: '2026-08-06',
    timestamp: Date.UTC(2026, 7, 6),
    description: '摘要正文。',
    descriptionSource: 'original',
    descriptionSourceUrls: [],
    commentSummary: null,
    ...overrides,
  };
}

test('renders a compact, collapsible provenance row for alternative summaries', () => {
  const markdown = generateMarkdownContent([
    story({
      descriptionSource: 'alternative',
      descriptionSourceUrls: ['https://news.example/path?one=1&two=2'],
    }),
  ], new Date('2026-08-06T00:00:00Z'));

  assert.match(markdown, /data-summary-source="alternative"/);
  assert.match(markdown, /<div class="description-heading description-heading--alternative">/);
  assert.match(markdown, /<strong>描述：<\/strong>/);
  assert.match(markdown, /<em class="summary-provenance__status"[^>]*>原文不可用，/);
  assert.match(markdown, /<details class="summary-provenance__details">/);
  assert.match(markdown, /<summary>[\s\S]*summary-provenance__action">查看 1 个备选来源<\/span>[\s\S]*<\/summary>/);
  assert.doesNotMatch(markdown, />备选摘要</);
  assert.match(markdown, /href="https:\/\/news\.example\/path\?one=1&amp;two=2"/);
  assert.match(markdown, /summary-provenance__source-description">Path<\/span>/);
  assert.doesNotMatch(markdown, /summary-provenance__mark/);
  assert.match(markdown, /摘要正文。/);
});

test('keeps original summaries free of alternative-source markup', () => {
  const markdown = generateMarkdownContent([
    story(),
  ], new Date('2026-08-06T00:00:00Z'));

  assert.doesNotMatch(markdown, /summary-provenance/);
  assert.match(markdown, /\*\*描述\*\*:\n\n摘要正文。/);
});

test('renders model-provided descriptions as plain text', () => {
  const markdown = generateMarkdownContent([
    story({
      description: '<script>alert(1)</script> [危险链接](javascript:alert(1))',
    }),
  ], new Date('2026-08-06T00:00:00Z'));

  assert.doesNotMatch(markdown, /<script>/);
  assert.match(markdown, /&lt;script&gt;alert\\\(1\\\)&lt;\/script&gt;/);
  assert.match(markdown, /\\\[危险链接\\\]\\\(javascript:alert\\\(1\\\)\\\)/);
});
