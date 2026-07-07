import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { PropostaStatus } from '../src/propostas/proposta-status.enum';
import { AlertasInput, construirAlertas } from '../src/alertas/alertas.types';

const now = new Date('2026-06-30T12:00:00'); // local — diasAte usa o calendário

const vazio = (): AlertasInput => ({
  certidoes: [],
  prazos: [],
  resumos: [],
  resultados: [],
});

describe('construirAlertas (T-90)', () => {
  it('certidão dentro de 30 dias vira alerta; fora da janela não', () => {
    const input: AlertasInput = {
      ...vazio(),
      certidoes: [
        {
          tipo: CertidaoTipo.FGTS,
          descricao: null,
          dataValidade: '2026-07-10', // 10 dias
          updatedAt: new Date('2026-06-20T10:00:00Z'),
        },
        {
          tipo: CertidaoTipo.CND_FEDERAL,
          descricao: null,
          dataValidade: '2026-12-31', // > 30 dias
          updatedAt: new Date('2026-06-20T10:00:00Z'),
        },
      ],
    };
    const r = construirAlertas(input, null, now);
    expect(r).toHaveLength(1);
    expect(r[0].cat).toBe('documento');
    expect(r[0].titulo).toContain('vence em 10 dias');
    // T-111: FGTS tem portal nacional de emissão → o card leva direto pra lá.
    expect(r[0].href).toMatch(/caixa/);
  });

  it('certidão sem portal nacional (estadual) leva ao cofre (T-111)', () => {
    const r = construirAlertas(
      {
        ...vazio(),
        certidoes: [
          {
            tipo: CertidaoTipo.ESTADUAL,
            descricao: null,
            dataValidade: '2026-07-10',
            updatedAt: new Date('2026-06-20T10:00:00Z'),
          },
        ],
      },
      null,
      now,
    );
    expect(r[0].href).toBe('/documentos');
  });

  it('certidão vencida vira alerta "vencida"', () => {
    const r = construirAlertas(
      {
        ...vazio(),
        certidoes: [
          {
            tipo: CertidaoTipo.FGTS,
            descricao: null,
            dataValidade: '2026-06-01',
            updatedAt: new Date('2026-05-01T10:00:00Z'),
          },
        ],
      },
      null,
      now,
    );
    expect(r[0].titulo).toContain('vencida');
  });

  it('prazo ≤14 dias entra; passado/longe não', () => {
    const base = {
      objeto: 'Obra X',
      dataPublicacao: new Date('2026-06-25T10:00:00Z'),
      propostaId: null,
    };
    const input: AlertasInput = {
      ...vazio(),
      prazos: [
        {
          ...base,
          editalId: 'e1',
          prazoProposta: new Date('2026-07-05T12:00:00Z'),
        }, // ~5d
        {
          ...base,
          editalId: 'e2',
          prazoProposta: new Date('2026-08-30T12:00:00Z'),
        }, // >14
        {
          ...base,
          editalId: 'e3',
          prazoProposta: new Date('2026-06-01T12:00:00Z'),
        }, // passou
      ],
    };
    const r = construirAlertas(input, null, now);
    const prazos = r.filter((a) => a.cat === 'prazo');
    expect(prazos).toHaveLength(1);
    expect(prazos[0].id).toBe('prazo:e1');
  });

  it('resumo e resultado viram alertas com href correto', () => {
    const r = construirAlertas(
      {
        ...vazio(),
        resumos: [
          {
            editalId: 'e1',
            objeto: 'UBS',
            updatedAt: new Date('2026-06-29T10:00:00Z'),
          },
        ],
        resultados: [
          {
            propostaId: 'p1',
            titulo: 'Quadra',
            status: PropostaStatus.GANHOU,
            updatedAt: new Date('2026-06-28T10:00:00Z'),
          },
        ],
      },
      null,
      now,
    );
    const ia = r.find((a) => a.cat === 'ia');
    const orc = r.find((a) => a.cat === 'orcamento');
    expect(ia?.href).toBe('/editais/e1');
    expect(orc?.titulo).toContain('ganhou');
    expect(orc?.href).toBe('/orcamentos/p1');
  });

  it('novo = data posterior a vistoEm; ordena por data desc', () => {
    const input: AlertasInput = {
      ...vazio(),
      resumos: [
        {
          editalId: 'e1',
          objeto: 'A',
          updatedAt: new Date('2026-06-29T10:00:00Z'),
        },
      ],
      resultados: [
        {
          propostaId: 'p1',
          titulo: 'B',
          status: PropostaStatus.GANHOU,
          updatedAt: new Date('2026-06-20T10:00:00Z'),
        },
      ],
    };
    const r = construirAlertas(input, new Date('2026-06-25T00:00:00Z'), now);
    // ordenado por data desc: resumo (29) antes do resultado (20).
    expect(r.map((a) => a.cat)).toEqual(['ia', 'orcamento']);
    expect(r[0].novo).toBe(true); // 29 > 25
    expect(r[1].novo).toBe(false); // 20 < 25
  });
});
