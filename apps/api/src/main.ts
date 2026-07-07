import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Confia no proxy (Render): sem isto, req.ip é o IP do proxy para todos e o
  // rate limit (T-104) viraria global. `1` = confia num único hop de proxy.
  app.set('trust proxy', 1);
  // Headers de segurança (T-119b): nosniff, frameguard, HSTS, COOP, referrer, etc.
  // CORP fica em `cross-origin` porque o front é outra origem e precisa LER as
  // respostas da API (o padrão `same-origin` bloquearia). A CSP da página é do
  // static site (front), não desta API JSON.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // CORS para o frontend (apps/web). Origin configurável por env; default = Vite dev.
  // `credentials: true` deixa o cookie httpOnly do refresh (T-119a) ir/voltar.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
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
