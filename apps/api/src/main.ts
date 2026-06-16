import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não declarados no DTO
      forbidNonWhitelisted: true, // rejeita requisições com campos extras
      transform: true, // converte payloads para as instâncias de DTO
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
