import { describe, it, expect } from 'vitest';
import { AiCostLimitExceededError, AiModelNotFoundError, AiPromptNotFoundError } from '../analyze';

describe('error classes', () => {
  it('AiCostLimitExceededError has correct fields', () => {
    const err = new AiCostLimitExceededError('organization', 150.5, 100);
    expect(err.code).toBe('ai_cost_limit_exceeded');
    expect(err.scope).toBe('organization');
    expect(err.currentCostRon).toBe(150.5);
    expect(err.limitRon).toBe(100);
    expect(err.message).toContain('organization');
    expect(err.message).toContain('150.50');
    expect(err.message).toContain('100.00');
  });

  it('AiCostLimitExceededError global scope', () => {
    const err = new AiCostLimitExceededError('global', 500, 400);
    expect(err.scope).toBe('global');
  });

  it('AiModelNotFoundError', () => {
    const err = new AiModelNotFoundError('gpt-5-turbo');
    expect(err.code).toBe('ai_model_not_found');
    expect(err.message).toContain('gpt-5-turbo');
  });

  it('AiPromptNotFoundError', () => {
    const err = new AiPromptNotFoundError('booking', 'summary');
    expect(err.code).toBe('ai_prompt_not_found');
    expect(err.message).toContain('booking');
    expect(err.message).toContain('summary');
  });
});
