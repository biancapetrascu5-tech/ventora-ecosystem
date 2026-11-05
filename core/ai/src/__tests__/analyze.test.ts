import { afterEach, describe, it, expect } from 'vitest';
import {
  AiCostLimitExceededError,
  AiModelNotFoundError,
  AiPromptNotFoundError,
  runAnalysis,
} from '../analyze';
import { setAiProvider } from '../channel';
import { TestAiAdapter } from '../adapters/test';
import { setAnalysisQuotaForTests } from '../quota';
import { AiRestrictedDataError, NO_PERSONAL_OR_HEALTH_DATA } from '../restricted-data';

afterEach(() => {
  setAiProvider(null);
  setAnalysisQuotaForTests(null);
});

describe('error classes', () => {
  it('AiCostLimitExceededError has its scope and amounts', () => {
    const err = new AiCostLimitExceededError('organization', 150.5, 100);
    expect(err.code).toBe('ai_cost_limit_exceeded');
    expect(err.scope).toBe('organization');
    expect(err.message).toContain('150.50');
    expect(err.message).toContain('100.00');
  });

  it('AiModelNotFoundError / AiPromptNotFoundError', () => {
    expect(new AiModelNotFoundError('gpt-x').code).toBe('ai_model_not_found');
    expect(new AiPromptNotFoundError('booking', 'summary').message).toContain('booking/summary');
  });
});

describe('runAnalysis — refused before the database, the quota and the provider', () => {
  const calls: string[] = [];
  const base = {
    organizationId: '00000000-0000-4000-8000-000000000001',
    applicationId: 'booking',
    userId: '00000000-0000-4000-8000-000000000002',
    promptKey: 'summary',
  };

  function wire() {
    const provider = new TestAiAdapter();
    setAiProvider(provider);
    setAnalysisQuotaForTests({
      reserve: async () => void calls.push('reserve'),
      commit: async () => void calls.push('commit'),
      release: async () => void calls.push('release'),
    });
    return provider;
  }

  it('personal data in the input → AiRestrictedDataError, nothing reserved or sent', async () => {
    const provider = wire();
    await expect(
      runAnalysis({
        ...base,
        userMessage: 'Clienta ana.pop@example.ro a anulat',
        dataAttestation: NO_PERSONAL_OR_HEALTH_DATA,
      }),
    ).rejects.toBeInstanceOf(AiRestrictedDataError);
    expect(provider.calls).toHaveLength(0);
    expect(calls).toEqual([]);
  });

  it('no attestation → AiRestrictedDataError', async () => {
    wire();
    await expect(
      runAnalysis({
        ...base,
        userMessage: 'text',
        dataAttestation: undefined as unknown as typeof NO_PERSONAL_OR_HEALTH_DATA,
      }),
    ).rejects.toMatchObject({ code: 'ai_restricted_data', kind: 'attestation_missing' });
  });

  it('no user → refused (an analysis is started by a user)', async () => {
    wire();
    await expect(
      runAnalysis({
        ...base,
        userId: '',
        userMessage: 'text',
        dataAttestation: NO_PERSONAL_OR_HEALTH_DATA,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
