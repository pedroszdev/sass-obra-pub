import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import {
  diagnosticarEdital,
  Veredito,
} from '../company-profile/habilitacao/diagnostico-edital';
import { ProntidaoInput } from '../company-profile/habilitacao/prontidao';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../editais/exigencias/edital-exigencias.entity';
import { ExigenciasHabilitacao } from '../editais/exigencias/exigencias.types';

// Decoração de aptidão (T-82): dado um usuário e uma lista de editais, devolve o
// veredito pré-computado (apto/quase/nao_apto) de cada um que JÁ tem exigências
// extraídas (T-49/T-54). SEM IA — só cruza o cache de exigências com o perfil
// (mesma lógica do diagnóstico T-51, §3.4). Módulo standalone (só repos) para
// não criar ciclo com editais/company-profile.
@Injectable()
export class AptidaoService {
  constructor(
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(Certidao)
    private readonly certidoes: Repository<Certidao>,
    @InjectRepository(Atestado)
    private readonly atestados: Repository<Atestado>,
    @InjectRepository(EditalExigencias)
    private readonly exigencias: Repository<EditalExigencias>,
  ) {}

  // Mapa editalId → veredito, só para os editais com exigências extraídas. Os
  // demais ficam de fora do mapa (o chamador trata como "sem veredito").
  async vereditosPara(
    userId: string,
    editalIds: string[],
  ): Promise<Map<string, Veredito>> {
    const out = new Map<string, Veredito>();
    if (editalIds.length === 0) return out;

    const extraidos = await this.exigencias.find({
      where: { editalId: In(editalIds), status: ExigenciasStatus.EXTRAIDO },
      select: { editalId: true, exigencias: true },
    });
    if (extraidos.length === 0) return out;

    const input = await this.loadProntidaoInput(userId);
    for (const e of extraidos) {
      if (!e.exigencias) continue;
      const { veredito } = diagnosticarEdital(
        e.exigencias as ExigenciasHabilitacao,
        input,
      );
      out.set(e.editalId, veredito);
    }
    return out;
  }

  // Dados do perfil usados no cruzamento. (Espelha o loader do CompanyProfile;
  // dívida conhecida: unificar num lugar só quando valer o refactor.)
  private async loadProntidaoInput(userId: string): Promise<ProntidaoInput> {
    const [profile, certidoes, atestadosCount] = await Promise.all([
      this.profiles.findOne({ where: { userId } }),
      this.certidoes.find({ where: { userId } }),
      this.atestados.count({ where: { userId } }),
    ]);
    return {
      certidoes: certidoes.map((c) => ({
        tipo: c.tipo,
        dataValidade: c.dataValidade,
      })),
      atestadosCount,
      capitalSocial: profile?.capitalSocial ?? null,
      registroProfissionalTipo: profile?.registroProfissionalTipo ?? null,
      registroProfissionalNumero: profile?.registroProfissionalNumero ?? null,
    };
  }
}
