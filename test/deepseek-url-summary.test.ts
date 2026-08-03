import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekProvider } from '../src/services/llm/deepseek';
import {
  EXTERNAL_CONTENT_UNAVAILABLE_DESCRIPTION,
  NO_EXTERNAL_LINK_DESCRIPTION,
  Translator,
} from '../src/services/translator';

function responsesApiResult(sourceUrl: string): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: "I'll search the target page." }],
      },
      {
        type: 'web_search_call',
        status: 'completed',
        action: { url: sourceUrl },
      },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: '测试摘要',
        }],
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('普通文本处理使用 deepseek-v4-flash Responses API', async () => {
  const originalFetch = globalThis.fetch;

  try {
    let requestUrl = '';
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: '处理结果' }],
        }],
        usage: {
          input_tokens: 10,
          output_tokens: 2,
          total_tokens: 12,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new DeepSeekProvider('test-key');
    const result = await provider.chatCompletion([
      { role: 'system', content: '翻译标题' },
      { role: 'user', content: 'Example' },
    ]);

    assert.equal(requestUrl, 'https://api.deepseek.com/responses');
    assert.equal(requestBody.model, 'deepseek-v4-flash');
    assert.deepEqual(requestBody.reasoning, { effort: 'none' });
    assert.equal(result.content, '处理结果');
    assert.deepEqual(result.usage, {
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('外链摘要仅接受目标页面来源', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const provider = new DeepSeekProvider('test-key');
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return responsesApiResult('https://www.example.com/article?source=search');
    };

    const summary = await provider.summarizeUrl(
      'https://example.com/article?utm_source=hn',
      'Example',
      300
    );
    assert.equal(summary, '测试摘要');
    assert.equal(requestBody.tool_choice, 'auto');

    globalThis.fetch = async () => responsesApiResult(
      'https://example.com/article?id=456'
    );
    const unrelatedSummary = await provider.summarizeUrl(
      'https://example.com/article?id=123',
      'Example',
      300
    );
    assert.equal(unrelatedSummary, null);

    globalThis.fetch = async () => new Response(JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'web_search_call',
          status: 'failed',
          action: { url: 'https://example.com/article?id=123' },
        },
        {
          type: 'web_search_call',
          status: 'completed',
          action: { url: 'https://example.com/article?id=456' },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({ status: 'ok', summary: '错误来源摘要' }),
          }],
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const failedTargetSummary = await provider.summarizeUrl(
      'https://example.com/article?id=123',
      'Example',
      300
    );
    assert.equal(failedTargetSummary, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('无外链和请求失败时返回固定提示并保持结果对齐', async () => {
  const originalFetch = globalThis.fetch;

  try {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('simulated network failure');
    };

    const translator = new Translator();
    translator.init({ apiKey: 'test-key' });
    const results = await translator.summarizeUrls([
      { title: 'No external link' },
      { title: 'Unavailable page', url: 'https://example.com/unavailable' },
    ]);

    assert.deepEqual(results, [
      NO_EXTERNAL_LINK_DESCRIPTION,
      EXTERNAL_CONTENT_UNAVAILABLE_DESCRIPTION,
    ]);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
