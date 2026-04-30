import { CerebrasProvider } from './cerebras';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';
import { TogetherProvider } from './together';
import {
  loadOptionalModule,
  ProviderUnavailableError,
  type ChatRequest,
  type ChatResponse,
  type Provider,
  type ProviderName,
  type Router,
  UpstreamProviderError,
} from './types';

export interface HealthState {
  unhealthyUntil: number;
  updatedAt: number;
}

export interface HealthStateStore {
  get(name: ProviderName): Promise<HealthState | undefined>;
  set(name: ProviderName, state: HealthState): Promise<void>;
}

export interface ProviderRouterOptions {
  providers?: Provider[];
  weights?: Partial<Record<ProviderName, number>>;
  random?: () => number;
  now?: () => number;
  cooldownMs?: number;
  healthStateStore?: HealthStateStore;
}

export const DEFAULT_PROVIDER_WEIGHTS: Record<ProviderName, number> = {
  groq: 4,
  cerebras: 3,
  together: 2,
  openrouter: 1,
};

class FirestoreHealthStateStore implements HealthStateStore {
  async get(name: ProviderName): Promise<HealthState | undefined> {
    const firestore = await getFirestore();
    if (!firestore) {
      return undefined;
    }

    const snapshot = await firestore.collection('providers').doc(name).get();
    const data = snapshot.data();
    const state = data?.healthState;
    if (!state || typeof state !== 'object') {
      return undefined;
    }

    const unhealthyUntil = Number((state as { unhealthyUntil?: unknown }).unhealthyUntil);
    const updatedAt = Number((state as { updatedAt?: unknown }).updatedAt);
    if (!Number.isFinite(unhealthyUntil) || !Number.isFinite(updatedAt)) {
      return undefined;
    }

    return {
      unhealthyUntil,
      updatedAt,
    };
  }

  async set(name: ProviderName, state: HealthState): Promise<void> {
    const firestore = await getFirestore();
    if (!firestore) {
      return;
    }

    await firestore.collection('providers').doc(name).set({ healthState: state }, { merge: true });
  }
}

export class ProviderRouter implements Router {
  private readonly providers: Provider[];
  private readonly weights: Record<ProviderName, number>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly cooldownMs: number;
  private readonly healthStateStore: HealthStateStore;
  private readonly inMemoryHealthState = new Map<ProviderName, HealthState>();

  constructor(options: ProviderRouterOptions = {}) {
    this.providers =
      options.providers ??
      [new GroqProvider(), new CerebrasProvider(), new TogetherProvider(), new OpenRouterProvider()];
    this.weights = { ...DEFAULT_PROVIDER_WEIGHTS, ...options.weights };
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.healthStateStore = options.healthStateStore ?? new FirestoreHealthStateStore();
  }

  async route(req: ChatRequest): Promise<ChatResponse> {
    const attempted = new Set<ProviderName>();
    const failures: string[] = [];

    while (attempted.size < this.providers.length) {
      const candidates = await this.getHealthyProviders(attempted);
      if (candidates.length === 0) {
        break;
      }

      const provider = this.pickWeightedProvider(candidates);
      attempted.add(provider.name);

      try {
        return await provider.chatCompletion(req);
      } catch (error) {
        if (error instanceof UpstreamProviderError && error.retryable) {
          failures.push(`${provider.name}: ${error.message}`);
          if (error.markUnhealthy) {
            await this.markUnhealthy(provider.name);
          }
          continue;
        }

        throw error;
      }
    }

    throw new ProviderUnavailableError(
      'All providers are currently unavailable.',
      await this.getRetryAfterSeconds(),
      failures,
    );
  }

  private async getHealthyProviders(excluded: Set<ProviderName>): Promise<Provider[]> {
    const healthyProviders: Provider[] = [];

    for (const provider of this.providers) {
      if (excluded.has(provider.name)) {
        continue;
      }

      if (await this.isHealthy(provider.name)) {
        healthyProviders.push(provider);
      }
    }

    return healthyProviders;
  }

  private async isHealthy(name: ProviderName): Promise<boolean> {
    const now = this.now();
    const inMemory = this.inMemoryHealthState.get(name);
    if (inMemory) {
      if (inMemory.unhealthyUntil > now) {
        return false;
      }
      this.inMemoryHealthState.delete(name);
    }

    const persisted = await this.healthStateStore.get(name);
    if (!persisted) {
      return true;
    }

    if (persisted.unhealthyUntil > now) {
      this.inMemoryHealthState.set(name, persisted);
      return false;
    }

    this.inMemoryHealthState.delete(name);
    return true;
  }

  private pickWeightedProvider(providers: Provider[]): Provider {
    const totalWeight = providers.reduce((sum, provider) => sum + Math.max(0, this.weights[provider.name] ?? 0), 0);
    if (totalWeight <= 0) {
      return providers[0];
    }

    let threshold = this.random() * totalWeight;
    for (const provider of providers) {
      threshold -= Math.max(0, this.weights[provider.name] ?? 0);
      if (threshold < 0) {
        return provider;
      }
    }

    return providers[providers.length - 1];
  }

  private async markUnhealthy(name: ProviderName): Promise<void> {
    const state: HealthState = {
      unhealthyUntil: this.now() + this.cooldownMs,
      updatedAt: this.now(),
    };

    this.inMemoryHealthState.set(name, state);
    await this.healthStateStore.set(name, state);
  }

  private async getRetryAfterSeconds(): Promise<number> {
    const now = this.now();
    const unhealthyUntilValues: number[] = [];

    for (const provider of this.providers) {
      const inMemory = this.inMemoryHealthState.get(provider.name);
      if (inMemory && inMemory.unhealthyUntil > now) {
        unhealthyUntilValues.push(inMemory.unhealthyUntil);
        continue;
      }

      const persisted = await this.healthStateStore.get(provider.name);
      if (persisted && persisted.unhealthyUntil > now) {
        unhealthyUntilValues.push(persisted.unhealthyUntil);
      }
    }

    if (unhealthyUntilValues.length === 0) {
      return Math.ceil(this.cooldownMs / 1000);
    }

    const earliestRecovery = Math.min(...unhealthyUntilValues);
    return Math.max(1, Math.ceil((earliestRecovery - now) / 1000));
  }
}

async function getFirestore(): Promise<
  | {
      collection: (
        collectionPath: string,
      ) => {
        doc: (
          documentPath: string,
        ) => {
          get: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
          set: (data: Record<string, unknown>, options: { merge: boolean }) => Promise<void>;
        };
      };
    }
  | undefined
> {
  const adminApp = await loadOptionalModule<{
    getApps?: () => unknown[];
    initializeApp?: () => unknown;
  }>('firebase-admin/app');
  const adminFirestore = await loadOptionalModule<{
    getFirestore?: (app?: unknown) => {
      collection: (
        collectionPath: string,
      ) => {
        doc: (
          documentPath: string,
        ) => {
          get: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
          set: (data: Record<string, unknown>, options: { merge: boolean }) => Promise<void>;
        };
      };
    };
  }>('firebase-admin/firestore');

  if (!adminApp?.getApps || !adminApp.initializeApp || !adminFirestore?.getFirestore) {
    return undefined;
  }

  const app = adminApp.getApps()[0] ?? adminApp.initializeApp();
  return adminFirestore.getFirestore(app);
}

export function createRouter(options: ProviderRouterOptions = {}): Router {
  return new ProviderRouter(options);
}

export {
  CerebrasProvider,
  GroqProvider,
  OpenRouterProvider,
  ProviderUnavailableError,
  TogetherProvider,
  UpstreamProviderError,
};

export * from './types';

export default ProviderRouter;
