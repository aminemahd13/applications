import { getStorageToken, getOptionsToken } from '@nestjs/throttler';
import { AppModule } from './app.module';
import { SafeThrottlerStorage } from './common/throttling/safe-throttler-storage';

describe('AppModule throttling', () => {
  function throttlerProviders() {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) ?? [];
    const throttlerModule = imports.find(
      (entry) => entry?.module?.name === 'ThrottlerModule',
    );
    expect(throttlerModule).toBeDefined();
    const optionsProvider = throttlerModule.providers.find(
      (provider: any) => provider?.provide === getOptionsToken(),
    );
    const storageProvider = throttlerModule.providers.find(
      (provider: any) => provider?.provide === getStorageToken(),
    );
    return { optionsProvider, storageProvider };
  }

  it('uses SafeThrottlerStorage for the global ThrottlerGuard', async () => {
    const { optionsProvider, storageProvider } = throttlerProviders();
    const options = await optionsProvider.useFactory();
    expect(options.storage).toBeInstanceOf(SafeThrottlerStorage);
    expect(storageProvider.useFactory(options)).toBe(options.storage);
  });

  it('creates a fresh storage per application instance', async () => {
    const { optionsProvider } = throttlerProviders();
    const first = await optionsProvider.useFactory();
    const second = await optionsProvider.useFactory();
    expect(first.storage).not.toBe(second.storage);
  });
});
