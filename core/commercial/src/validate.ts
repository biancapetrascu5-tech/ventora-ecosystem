import type { ApplicationManifest, FeatureDeclaration, QuotaDeclaration } from '@ventora/contracts';
import type { RegistryApplication } from './applications';

// Same formats as the CHECK constraints in commercial_init: a refused manifest fails the deploy
// sync before any write, with a message that names the key.
const APP_ID_RE = /^[a-z][a-z0-9-]*$/;
const KEY_RE = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
const UNIT_RE = /^[a-z][a-z0-9_]*$/;

export interface RegistryPlan {
  applications: RegistryApplication[];
  features: Array<FeatureDeclaration & { applicationId: string }>;
  quotas: Array<QuotaDeclaration & { applicationId: string }>;
}

/**
 * Checks the manifests against the registry of applications and flattens their keys. Throws on
 * the first problem: an application outside the registry, a key declared twice (in one or two
 * manifests), a bad format, a flow quota without `month` or a stock quota with a period.
 */
export function planRegistry(
  applications: readonly RegistryApplication[],
  manifests: readonly ApplicationManifest[],
): RegistryPlan {
  const appIds = new Set<string>();
  for (const app of applications) {
    if (!APP_ID_RE.test(app.id)) throw new Error(`[commercial] bad application id: ${app.id}`);
    if (appIds.has(app.id)) throw new Error(`[commercial] application listed twice: ${app.id}`);
    appIds.add(app.id);
  }

  const manifestIds = new Set<string>();
  const seen = new Map<string, string>();
  const features: RegistryPlan['features'] = [];
  const quotas: RegistryPlan['quotas'] = [];

  const claim = (key: string, kind: 'feature' | 'quota', applicationId: string) => {
    if (!KEY_RE.test(key)) throw new Error(`[commercial] bad ${kind} key: ${key}`);
    const other = seen.get(`${kind}:${key}`);
    if (other) {
      throw new Error(`[commercial] ${kind} key ${key} declared by ${other} and ${applicationId}`);
    }
    seen.set(`${kind}:${key}`, applicationId);
  };

  for (const manifest of manifests) {
    const applicationId = manifest.applicationId;
    if (!appIds.has(applicationId)) {
      throw new Error(
        `[commercial] manifest for an application outside the registry: ${applicationId}`,
      );
    }
    if (manifestIds.has(applicationId)) {
      throw new Error(`[commercial] two manifests for ${applicationId}`);
    }
    manifestIds.add(applicationId);

    for (const feature of manifest.features ?? []) {
      claim(feature.key, 'feature', applicationId);
      features.push({ ...feature, applicationId });
    }
    for (const quota of manifest.quotas ?? []) {
      claim(quota.key, 'quota', applicationId);
      if (quota.kind !== 'flow' && quota.kind !== 'stock') {
        throw new Error(`[commercial] quota ${quota.key}: kind must be flow or stock`);
      }
      if (quota.kind === 'flow' && quota.period !== 'month') {
        throw new Error(`[commercial] flow quota ${quota.key} needs period 'month'`);
      }
      if (quota.kind === 'stock' && quota.period !== null) {
        throw new Error(`[commercial] stock quota ${quota.key} has no period`);
      }
      if (quota.overflow !== 'block') {
        throw new Error(`[commercial] quota ${quota.key}: overflow must be 'block' (D3-6)`);
      }
      if (!UNIT_RE.test(quota.unit)) {
        throw new Error(`[commercial] quota ${quota.key}: bad unit ${quota.unit}`);
      }
      quotas.push({ ...quota, applicationId });
    }
  }

  return { applications: [...applications], features, quotas };
}
