import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { diagnosticarEdital } from '../src/company-profile/habilitacao/diagnostico-edital';
import { ProntidaoInput } from '../src/company-profile/habilitacao/habilitacao-checks';
import { ExigenciasHabilitacao } from '../src/editais/exigencias/exigencias.types';

const NOW = new Date('2026-06-23T12:00:00Z');

function emDias(dias: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function exig(
  over: Partial<ExigenciasHabilitacao> = {},
): ExigenciasHabilitacao {
  return {
    resumoObjeto: 'Obra',
    certidoes: [],
    registroConselho: { exigido: false, conselho: null, trecho: null },
    capacidadeTecnica: { exigida: false, descricao: null, trecho: null },
    capitalSocial: {
      exigido: false,
      valorMinimoReais: null,
      percentualSobreEstimado: null,
      trecho: null,
    },
    garantia: { exigida: false, trecho: null },
    outrosRequisitos: [],
    ...over,
  };
}

function input(over: Partial<ProntidaoInput> = {}): ProntidaoInput {
  return {
    certidoes: [],
    atestadosCount: 0,
    capitalSocial: null,
    registroProfissionalTipo: null,
    registroProfissionalNumero: null,
    uf: 'SC',
    ...over,
  };
}

describe('diagnosticarEdital (T-51)', () => {
  it('itera só o que o EDITAL exige (não o catálogo fixo)', () => {
    const r = diagnosticarEdital(
      exig({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, exigida: true, trecho: null },
        ],
      }),
      input(),
      NOW,
    );
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].key).toBe('certidao:CND_FEDERAL');
  });

  it('apto quando o perfil atende tudo que o edital exige', () => {
    const r = diagnosticarEdital(
      exig({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, exigida: true, trecho: null },
        ],
        registroConselho: { exigido: true, conselho: 'CREA', trecho: null },
        capacidadeTecnica: { exigida: true, descricao: null, trecho: null },
      }),
      input({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: emDias(120) },
        ],
        registroProfissionalTipo: 'CREA',
        registroProfissionalNumero: '123',
        atestadosCount: 2,
      }),
      NOW,
    );
    expect(r.veredito).toBe('apto');
    expect(r.faltam).toEqual([]);
    expect(r.itens).toHaveLength(3);
  });

  it('não apto quando falta um requisito exigido', () => {
    const r = diagnosticarEdital(
      exig({
        certidoes: [{ tipo: CertidaoTipo.FGTS, exigida: true, trecho: null }],
      }),
      input(),
      NOW,
    );
    expect(r.veredito).toBe('nao_apto');
    expect(r.faltam).toContain('Regularidade com o FGTS (CRF)');
  });

  it('quase quando tudo presente mas algo a renovar (atenção)', () => {
    const r = diagnosticarEdital(
      exig({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, exigida: true, trecho: null },
        ],
      }),
      input({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: emDias(10) },
        ],
      }),
      NOW,
    );
    expect(r.veredito).toBe('quase');
    expect(r.atencao).toBe(1);
  });

  it('usa o capital MÍNIMO do edital (mais rico que a T-45)', () => {
    const ex = exig({
      capitalSocial: {
        exigido: true,
        valorMinimoReais: 100000,
        percentualSobreEstimado: 5,
        trecho: null,
      },
    });
    const abaixo = diagnosticarEdital(ex, input({ capitalSocial: 50000 }), NOW);
    expect(abaixo.veredito).toBe('nao_apto');
    expect(abaixo.itens[0].motivo).toContain('abaixo do mínimo');

    const acima = diagnosticarEdital(ex, input({ capitalSocial: 150000 }), NOW);
    expect(acima.veredito).toBe('apto');
  });

  it('garantia, certidão OUTRA e outrosRequisitos viram observações (não pontuam)', () => {
    const r = diagnosticarEdital(
      exig({
        garantia: { exigida: true, trecho: null },
        certidoes: [
          { tipo: CertidaoTipo.OUTRA, exigida: true, trecho: 'Certidão X' },
        ],
        outrosRequisitos: ['Declaração Y'],
      }),
      input(),
      NOW,
    );
    expect(r.itens).toHaveLength(0);
    expect(r.observacoes.length).toBeGreaterThanOrEqual(3);
    // T-116b: nada verificável não é "apto" — é indefinido.
    expect(r.veredito).toBe('indefinido');
    expect(r.observacoes[0]).toContain('verificada');
  });

  it('capital mínimo em % do estimado é cruzado com o valorEstimado (T-116a)', () => {
    const ex = exig({
      capitalSocial: {
        exigido: true,
        valorMinimoReais: null,
        percentualSobreEstimado: 10, // 10% de 1.000.000 = 100.000
        trecho: null,
      },
    });
    const abaixo = diagnosticarEdital(
      ex,
      input({ capitalSocial: 50000 }),
      NOW,
      1_000_000,
    );
    expect(abaixo.veredito).toBe('nao_apto');
    expect(abaixo.itens[0].motivo).toContain('abaixo do mínimo');

    const acima = diagnosticarEdital(
      ex,
      input({ capitalSocial: 150000 }),
      NOW,
      1_000_000,
    );
    expect(acima.veredito).toBe('apto');
  });

  it('capital em % sem valorEstimado → atenção, não falso apto (T-116a)', () => {
    const ex = exig({
      capitalSocial: {
        exigido: true,
        valorMinimoReais: null,
        percentualSobreEstimado: 10,
        trecho: null,
      },
    });
    const r = diagnosticarEdital(
      ex,
      input({ capitalSocial: 150000 }),
      NOW,
      null,
    );
    expect(r.itens[0].status).toBe('atencao');
    expect(r.veredito).toBe('quase');
  });

  it('tipo de certidão repetido não conta 2x nem infla o percentual (T-116c)', () => {
    const r = diagnosticarEdital(
      exig({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, exigida: true, trecho: null },
          { tipo: CertidaoTipo.CND_FEDERAL, exigida: true, trecho: null },
        ],
      }),
      input({
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: emDias(120) },
        ],
      }),
      NOW,
    );
    expect(r.itens).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.percentual).toBe(100);
  });
});
