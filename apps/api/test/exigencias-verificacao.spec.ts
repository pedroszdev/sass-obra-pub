import {
  normalizaTexto,
  temSinalHabilitacao,
  verificarTrechos,
} from '../src/editais/exigencias/exigencias-verificacao';
import { ExigenciasHabilitacao } from '../src/editais/exigencias/exigencias.types';
import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';

function exigenciasVazias(): ExigenciasHabilitacao {
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
  };
}

describe('exigencias-verificacao', () => {
  describe('normalizaTexto', () => {
    it('remove acentos, baixa caixa, normaliza aspas e espaços', () => {
      expect(normalizaTexto('  Habilitação “Federal”\n\tFGTS ')).toBe(
        'habilitacao "federal" fgts',
      );
    });
  });

  describe('temSinalHabilitacao', () => {
    const longo = (s: string) => s.padEnd(2000, ' x');

    it('detecta edital com seção de habilitação (2+ sinais, tamanho ok)', () => {
      expect(
        temSinalHabilitacao(longo('habilitação, regularidade fiscal e FGTS')),
      ).toBe(true);
    });

    it('rejeita texto curto (só resumo/aviso — T-47)', () => {
      expect(temSinalHabilitacao('habilitação e regularidade')).toBe(false);
    });

    it('rejeita texto longo sem sinais (ex.: projeto executivo — T-48)', () => {
      expect(
        temSinalHabilitacao(
          longo('memorial descritivo de pavimentação asfáltica'),
        ),
      ).toBe(false);
    });

    // T-137 — achado da T-107: "certidao" e "cnpj" saem em qualquer apêndice/ART.
    // Com eles na lista, dois genéricos bastavam para o portão aprovar um
    // "Apendice_As_Built.pdf" como se fosse o edital.
    it('rejeita anexo que só cita "certidão" e "CNPJ" (regressão da T-107)', () => {
      expect(
        temSinalHabilitacao(
          longo(
            'Apêndice As Built. O CNPJ da contratada consta da certidao anexa.',
          ),
        ),
      ).toBe(false);
    });

    it('ainda aceita edital que cita fazenda e CNDT', () => {
      expect(
        temSinalHabilitacao(
          longo('prova de regularidade com a Fazenda Federal e a CNDT'),
        ),
      ).toBe(true);
    });
  });

  describe('verificarTrechos', () => {
    const texto =
      'O licitante deve apresentar prova de regularidade com o FGTS e certidao negativa.';

    it('conta como ok o trecho que existe literalmente no edital', () => {
      const e = exigenciasVazias();
      e.certidoes = [
        {
          tipo: CertidaoTipo.FGTS,
          exigida: true,
          trecho: 'regularidade com o FGTS',
        },
      ];
      expect(verificarTrechos(e, texto)).toEqual({ ok: 1, total: 1 });
    });

    it('conta como falha o trecho inexistente (alucinação)', () => {
      const e = exigenciasVazias();
      e.certidoes = [
        {
          tipo: CertidaoTipo.MUNICIPAL,
          exigida: true,
          trecho: 'certidão municipal emitida pela prefeitura de outra cidade',
        },
      ];
      expect(verificarTrechos(e, texto)).toEqual({ ok: 0, total: 1 });
    });

    it('ignora trechos curtos demais (não verificáveis) e itens não exigidos', () => {
      const e = exigenciasVazias();
      e.certidoes = [
        { tipo: CertidaoTipo.FGTS, exigida: true, trecho: 'FGTS' },
      ];
      e.registroConselho = { exigido: false, conselho: null, trecho: 'CREA' };
      expect(verificarTrechos(e, texto)).toEqual({ ok: 0, total: 0 });
    });
  });
});
