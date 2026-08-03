/**
 * LLM Service - DeepSeek Only
 */

import { DeepSeekProvider } from './deepseek';

export { DeepSeekProvider } from './deepseek';

export function createDeepSeekProvider(apiKey: string): DeepSeekProvider {
  return new DeepSeekProvider(apiKey);
}
