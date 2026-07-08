import { FindOperator } from 'typeorm';
import {
  SITUACOES_INATIVAS,
  isSituacaoInativa,
  situacaoAtivaWhere,
} from '../src/editais/situacao';

describe('isSituacaoInativa (T-114)', () => {
  it.each([...SITUACOES_INATIVAS])('%s é inativa', (s) => {
    expect(isSituacaoInativa(s)).toBe(true);
  });

  it('Divulgada no PNCP é ativa', () => {
    expect(isSituacaoInativa('Divulgada no PNCP')).toBe(false);
  });

  it('null/undefined = ativo (desconhecido, favor recall)', () => {
    expect(isSituacaoInativa(null)).toBe(false);
    expect(isSituacaoInativa(undefined)).toBe(false);
  });

  it('valor desconhecido = ativo (só escondemos o que sabemos morto)', () => {
    expect(isSituacaoInativa('Homologada')).toBe(false);
  });
});

describe('situacaoAtivaWhere (T-114)', () => {
  it('gera um Raw "IS NULL OR NOT IN (...)" com as inativas como params', () => {
    const op = situacaoAtivaWhere();
    expect(op).toBeInstanceOf(FindOperator);

    // Internos do TypeORM (Raw): `_getSql` é o gerador (recebe o alias) e
    // `_objectLiteralParameters` guarda os params nomeados. Não são tipados
    // publicamente — daí o cast.
    const raw = op as unknown as {
      _getSql: (alias: string) => string;
      _objectLiteralParameters: Record<string, string>;
    };
    const sql = raw._getSql('e.situacao');
    expect(sql).toContain('e.situacao IS NULL');
    expect(sql).toContain('NOT IN');
    expect(sql).toContain(':sit0');
    expect(sql).toContain(`:sit${SITUACOES_INATIVAS.length - 1}`);

    // Cada situação inativa vira um param nomeado com o valor exato.
    expect(Object.values(raw._objectLiteralParameters).sort()).toEqual(
      [...SITUACOES_INATIVAS].sort(),
    );
  });
});
