import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import {
  AgendaCertidaoInput,
  AgendaEditalInput,
  montarAgenda,
} from '../src/agenda/agenda.types';

const now = new Date('2026-06-30T12:00:00Z');

const edital = (over: Partial<AgendaEditalInput> = {}): AgendaEditalInput => ({
  id: 'e1',
  objeto: 'Pavimentação',
  municipioNome: 'Lages',
  uf: 'SC',
  prazoProposta: new Date('2026-07-10T13:00:00Z'),
  propostaId: null,
  ...over,
});

describe('montarAgenda (T-91)', () => {
  it('inclui entrega de proposta futura (com link da proposta)', () => {
    const r = montarAgenda([edital({ propostaId: 'p1' })], [], now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      tipo: 'entrega_proposta',
      titulo: 'Pavimentação',
      subtitulo: 'Lages/SC',
      editalId: 'e1',
      propostaId: 'p1',
    });
  });

  it('exclui prazo de proposta já vencido', () => {
    const r = montarAgenda(
      [edital({ prazoProposta: new Date('2026-06-01T13:00:00Z') })],
      [],
      now,
    );
    expect(r).toHaveLength(0);
  });

  it('ignora edital sem prazo de proposta', () => {
    expect(montarAgenda([edital({ prazoProposta: null })], [], now)).toEqual(
      [],
    );
  });

  it('inclui vencimento de certidão (mesmo vencida) e usa o rótulo do tipo', () => {
    const certidoes: AgendaCertidaoInput[] = [
      { tipo: CertidaoTipo.FGTS, descricao: null, dataValidade: '2026-05-01' },
    ];
    const r = montarAgenda([], certidoes, now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      tipo: 'certidao_vencimento',
      titulo: 'FGTS (CRF)',
      editalId: null,
    });
  });

  it('certidão OUTRA usa a descrição como título', () => {
    const r = montarAgenda(
      [],
      [
        {
          tipo: CertidaoTipo.OUTRA,
          descricao: 'Alvará',
          dataValidade: '2026-08-01',
        },
      ],
      now,
    );
    expect(r[0].titulo).toBe('Alvará');
  });

  it('ordena todos os eventos por data crescente', () => {
    const r = montarAgenda(
      [edital({ id: 'e1', prazoProposta: new Date('2026-07-20T12:00:00Z') })],
      [
        {
          tipo: CertidaoTipo.CND_FEDERAL,
          descricao: null,
          dataValidade: '2026-07-05',
        },
        {
          tipo: CertidaoTipo.FGTS,
          descricao: null,
          dataValidade: '2026-08-15',
        },
      ],
      now,
    );
    expect(r.map((e) => e.data.slice(0, 10))).toEqual([
      '2026-07-05',
      '2026-07-20',
      '2026-08-15',
    ]);
  });
});
