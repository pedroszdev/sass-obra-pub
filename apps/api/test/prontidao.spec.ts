import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import {
  avaliarProntidao,
  ProntidaoInput,
} from '../src/company-profile/habilitacao/prontidao';
import { REQUISITOS_HABILITACAO_OBRA } from '../src/company-profile/habilitacao/requisitos-catalog';

// "Hoje" fixo para determinismo.
const NOW = new Date('2026-06-23T12:00:00Z');

// dataValidade relativa a NOW (em dias).
function emDias(dias: number): string {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const vazio: ProntidaoInput = {
  certidoes: [],
  atestadosCount: 0,
  capitalSocial: null,
  patrimonioLiquido: null,
  registroProfissionalTipo: null,
  registroProfissionalNumero: null,
  uf: 'SC',
};

// Perfil que atende TODOS os requisitos (certidões válidas + registro + atestado
// + capital). Útil para o caso 100%.
function perfilCompleto(): ProntidaoInput {
  const certidoesTipos = REQUISITOS_HABILITACAO_OBRA.filter(
    (r) => r.check.tipo === 'certidao',
  ).map((r) => (r.check as { certidaoTipo: CertidaoTipo }).certidaoTipo);
  return {
    certidoes: certidoesTipos.map((tipo) => ({
      tipo,
      dataValidade: emDias(180),
    })),
    atestadosCount: 2,
    capitalSocial: 150000,
    patrimonioLiquido: 150000,
    registroProfissionalTipo: 'CREA',
    registroProfissionalNumero: 'SC-123',
    uf: 'SC',
  };
}

function item(input: ProntidaoInput, key: string) {
  return avaliarProntidao(input, NOW).itens.find((i) => i.key === key)!;
}

describe('avaliarProntidao (motor T-45)', () => {
  it('perfil vazio: nada atendido, percentual 0, todos os itens presentes', () => {
    const r = avaliarProntidao(vazio, NOW);
    expect(r.total).toBe(REQUISITOS_HABILITACAO_OBRA.length);
    expect(r.atendidos).toBe(0);
    expect(r.percentual).toBe(0);
    expect(r.itens.every((i) => i.status === 'nao_atendido')).toBe(true);
  });

  it('perfil completo: tudo atendido, percentual 100', () => {
    const r = avaliarProntidao(perfilCompleto(), NOW);
    expect(r.atendidos).toBe(r.total);
    expect(r.percentual).toBe(100);
    expect(r.naoAtendidos).toBe(0);
  });

  it('certidão válida (>30d) → atendido', () => {
    const i = item(
      {
        ...vazio,
        certidoes: [{ tipo: CertidaoTipo.FGTS, dataValidade: emDias(90) }],
      },
      'fgts',
    );
    expect(i.status).toBe('atendido');
    expect(i.motivo).toMatch(/Válida até/);
  });

  it('certidão vencendo (≤30d, ainda válida) → atencao', () => {
    const i = item(
      {
        ...vazio,
        certidoes: [{ tipo: CertidaoTipo.FGTS, dataValidade: emDias(10) }],
      },
      'fgts',
    );
    expect(i.status).toBe('atencao');
    expect(i.motivo).toMatch(/Vence em 10 dias/);
  });

  it('certidão vencida → nao_atendido com "renove"', () => {
    const i = item(
      {
        ...vazio,
        certidoes: [{ tipo: CertidaoTipo.FGTS, dataValidade: emDias(-3) }],
      },
      'fgts',
    );
    expect(i.status).toBe('nao_atendido');
    expect(i.motivo).toMatch(/renove/);
  });

  it('certidão sem data de validade → atencao', () => {
    const i = item(
      {
        ...vazio,
        certidoes: [{ tipo: CertidaoTipo.FGTS, dataValidade: null }],
      },
      'fgts',
    );
    expect(i.status).toBe('atencao');
    expect(i.motivo).toMatch(/Sem data de validade/);
  });

  it('várias do mesmo tipo: usa a de melhor validade', () => {
    const i = item(
      {
        ...vazio,
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: emDias(-10) }, // vencida
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: emDias(120) }, // válida
        ],
      },
      'regularidade_federal',
    );
    expect(i.status).toBe('atendido');
  });

  it('vencida não esconde outra sem data do mesmo tipo (T-116c)', () => {
    const i = item(
      {
        ...vazio,
        certidoes: [
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: emDias(-10) }, // vencida
          { tipo: CertidaoTipo.CND_FEDERAL, dataValidade: null }, // sem data
        ],
      },
      'regularidade_federal',
    );
    // A vencida sozinha daria nao_atendido; a sem data vale mais (atencao).
    expect(i.status).toBe('atencao');
  });

  it('registro CREA/CAU: atendido só com tipo E número', () => {
    expect(
      item(
        {
          ...vazio,
          registroProfissionalTipo: 'CREA',
          registroProfissionalNumero: 'X',
        },
        'registro_conselho',
      ).status,
    ).toBe('atendido');
    expect(
      item({ ...vazio, registroProfissionalTipo: 'CREA' }, 'registro_conselho')
        .status,
    ).toBe('nao_atendido');
  });

  it('capacidade técnica: atendido com ≥1 atestado', () => {
    expect(
      item({ ...vazio, atestadosCount: 1 }, 'capacidade_tecnica').status,
    ).toBe('atendido');
    expect(item(vazio, 'capacidade_tecnica').status).toBe('nao_atendido');
  });

  it('capital social: atendido só se > 0', () => {
    expect(item({ ...vazio, capitalSocial: 1 }, 'capital_social').status).toBe(
      'atendido',
    );
    expect(item({ ...vazio, capitalSocial: 0 }, 'capital_social').status).toBe(
      'nao_atendido',
    );
  });

  it('contadores batem com o total', () => {
    const r = avaliarProntidao(
      {
        ...vazio,
        certidoes: [{ tipo: CertidaoTipo.FGTS, dataValidade: emDias(90) }],
        atestadosCount: 1,
      },
      NOW,
    );
    expect(r.atendidos + r.atencao + r.naoAtendidos).toBe(r.total);
  });
});
