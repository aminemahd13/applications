import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  configureHttpApp,
  validateProductionEnv,
} from './bootstrap/configure-app';

async function bootstrap() {
  validateProductionEnv();
  const app = await NestFactory.create(AppModule);
  const runtime = configureHttpApp(app);

  try {
    await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
    console.log(`Application is running on: ${await app.getUrl()}`);
  } catch (error) {
    await runtime.close();
    throw error;
  }
}
bootstrap();
