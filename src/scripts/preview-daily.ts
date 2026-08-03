/**
 * 生成 GitHub 发布前的完整输出，不执行任何发布操作。
 */

import { generateDailyExport } from './daily-export-simple';

async function main(): Promise<void> {
  const deepseekApiKey = process.env.LLM_DEEPSEEK_API_KEY;
  if (!deepseekApiKey) {
    throw new Error('未设置 LLM_DEEPSEEK_API_KEY，请在项目根目录的 .env 中配置');
  }

  console.log('='.repeat(60));
  console.log('🔎 HackerNews Daily 发布前预览');
  console.log('此脚本不会调用 GitHub 或 Telegram');
  console.log('='.repeat(60));

  const output = await generateDailyExport(deepseekApiKey);
  if (!output) {
    console.log('⚠️  无文章，无内容可预览');
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('结构化数据（GitHub 发布前）');
  console.log('='.repeat(60));
  console.log(JSON.stringify(output.processedStories, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('最终 Markdown（GitHub 实际接收的内容）');
  console.log('='.repeat(60));
  console.log(output.markdown);

  console.log('='.repeat(60));
  console.log(`✅ 预览完成：${output.processedStories.length} 篇文章`);
  console.log(`   数据日期：${output.sourceDate} (UTC)`);
  console.log(`   输出日期：${output.date}`);
  console.log(`   成功读取外链：${output.contentSuccess}/${output.processedStories.length}`);
  console.log('   未调用 GitHub 或 Telegram');
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('\n❌ 预览失败:', error);
  process.exit(1);
});
