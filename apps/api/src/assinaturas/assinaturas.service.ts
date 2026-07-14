import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Acesso, calcularAcesso, trialTermina } from './acesso';
import { Assinatura } from './assinatura.entity';
import { AssinaturaStatus } from './assinatura-status.enum';

// Assinatura do usuário (BACKLOG T-127). Aqui NÃO se fala com a Stripe — isso é
// a T-128. Esta camada só sabe: criar o trial no cadastro, ler o estado, e
// responder "pode usar?" (delegando à função pura de acesso, §3.3).
@Injectable()
export class AssinaturasService {
  private readonly logger = new Logger(AssinaturasService.name);

  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
  ) {}

  // Cria o trial de 7 dias no cadastro (e-mail ou Google). IDEMPOTENTE: se já
  // existe assinatura para o usuário, não faz nada — um `orIgnore` sobre o UNIQUE
  // evita que uma corrida (dois cadastros simultâneos do mesmo e-mail) derrube o
  // cadastro com violação de chave. Nada é criado na Stripe aqui.
  async iniciarTrial(userId: string, now: Date = new Date()): Promise<void> {
    await this.assinaturas
      .createQueryBuilder()
      .insert()
      .values({
        userId,
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: trialTermina(now),
      })
      .orIgnore()
      .execute();
  }

  findByUser(userId: string): Promise<Assinatura | null> {
    return this.assinaturas.findOne({ where: { userId } });
  }

  // "Pode usar o produto?" — a resposta é do BACKEND (§3.3). O front renderiza,
  // nunca decide. É isto que o paywall (T-130) vai consumir.
  async acessoDe(userId: string, now: Date = new Date()): Promise<Acesso> {
    const assinatura = await this.findByUser(userId);
    if (!assinatura) {
      // Conta sem assinatura não deveria existir (o cadastro cria, e a migration
      // fez o backfill). Se aparecer, é bug nosso — e o usuário não pode pagar o
      // preço dele em silêncio: registra e segue pela função pura.
      this.logger.warn(`Usuário ${userId} sem assinatura — verificar T-127.`);
    }
    return calcularAcesso(assinatura, now);
  }
}
