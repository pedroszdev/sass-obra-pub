// A instrumentação do Sentry (T-106) tem de rodar ANTES de qualquer outro import
// — por isso esta linha é a primeira do arquivo. Ver src/instrument.ts.
import './instrument';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { sentryHabilitado } from './instrument';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  // `rawBody: true`: guarda o corpo CRU da requisição além do JSON parseado. O
  // webhook da Stripe (T-129) verifica a assinatura sobre os BYTES ORIGINAIS —
  // com o corpo já parseado e re-serializado, a verificação falha sempre. É a
  // armadilha clássica do Nest com webhooks; não remova.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  if (sentryHabilitado) {
    logger.log('Sentry ativo — erros de produção serão reportados.');
  } else {
    logger.warn('SENTRY_DSN ausente — erros NÃO serão reportados (T-106).');
  }
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
