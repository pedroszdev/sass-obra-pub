import { describe, expect, it } from 'vitest';
import { encurtarObjeto } from './objeto';

// Todos os "antes" abaixo são objetos REAIS da base (PNCP, editais de obra).
describe('encurtarObjeto', () => {
  it('remove "contratação de empresa especializada para execução de obras de"', () => {
    expect(
      encurtarObjeto(
        'Contratação de empresa especializada para execução de obras de pavimentação asfáltica sobre paralelepípedo em via urbana do Bairro Alto Paraguaçu',
      ),
    ).toBe(
      'Pavimentação asfáltica sobre paralelepípedo em via urbana do Bairro Alto Paraguaçu',
    );
  });

  it('remove a tag de origem entre colchetes', () => {
    expect(
      encurtarObjeto(
        '[Portal de Compras Públicas] - CONTRATAÇÃO DE OBRA COMUM DE ENGENHARIA PARA CONSTRUÇÃO DE UNIDADE DE ECOPONTO NO BAIRRO SÃO LUIZ',
      ),
    ).toBe('CONSTRUÇÃO DE UNIDADE DE ECOPONTO NO BAIRRO SÃO LUIZ');
  });

  // Encadeamento: abertura → contratação → execução, na ordem.
  it('remove abertura + contratação + execução encadeadas', () => {
    expect(
      encurtarObjeto(
        'A presente licitação tem como objeto a Contratação de empresa para Execução da obra de construção de uma praça Poliesportiva, no Conjunto Porto União',
      ),
    ).toBe(
      'Construção de uma praça Poliesportiva, no Conjunto Porto União',
    );
  });

  it('remove "prestação dos serviços de"', () => {
    expect(
      encurtarObjeto(
        'Contratação de empresa especializada para execução dos serviços de pavimentação em concreto e drenagem pluvial da rua Odete Etelvina da Costa',
      ),
    ).toBe(
      'Pavimentação em concreto e drenagem pluvial da rua Odete Etelvina da Costa',
    );
  });

  it('capitaliza a primeira letra do que sobra', () => {
    expect(
      encurtarObjeto(
        'Contratação de empresa para a execução de obra de pavimentação em lajota sextavada de concreto da Rua Inácio Busnardo',
      ),
    ).toMatch(/^Pavimentação em lajota/);
  });

  // A guarda que impede título vazio: se o preâmbulo é tudo que existe,
  // devolvemos o objeto cru em vez de uma string sem sentido.
  it('devolve o original quando sobraria pouco demais', () => {
    const curto = 'Contratação de empresa especializada';
    expect(encurtarObjeto(curto)).toBe(curto);
  });

  // Variantes reais que a 1ª versão do regex deixou passar — vistas na tela de
  // busca, não nos testes. Por isso viraram caso fixo.
  it('remove qualificador "no ramo da construção civil"', () => {
    expect(
      encurtarObjeto(
        'Contratação de empresa especializada no ramo da construção civil para execução de reforma da Escolinha do Lajeado, localizada na SC 110',
      ),
    ).toBe('Reforma da Escolinha do Lajeado, localizada na SC 110');
  });

  it('remove "Contratação de Obras e Serviços de Engenharia para"', () => {
    expect(
      encurtarObjeto(
        'Contratação de Obras e Serviços de Engenharia para Ampliação da Unidade Básica de Saúde, conforme projeto',
      ),
    ).toBe('Ampliação da Unidade Básica de Saúde, conforme projeto');
  });

  it('remove a modalidade quando ela abre o objeto', () => {
    expect(
      encurtarObjeto(
        'CONCORRÊNCIA ELETRÔNICA PARA CONTRATAÇÃO DE SERVIÇOS DE OBRA E ENGENHARIA COM FORNECIMENTO DE MATERIAIS, DESTINADOS À PONTE',
      ),
    ).toBe('SERVIÇOS DE OBRA E ENGENHARIA COM FORNECIMENTO DE MATERIAIS, DESTINADOS À PONTE');
  });

  it('remove "na realização de"', () => {
    expect(
      encurtarObjeto(
        'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA NA REALIZAÇÃO DE PAVIMENTAÇÃO ASFÁLTICA DA RUA JOÃO PESSOA',
      ),
    ).toBe('PAVIMENTAÇÃO ASFÁLTICA DA RUA JOÃO PESSOA');
  });

  // A guarda do lookahead: sem ela, "na Rua" seria tratado como preâmbulo e o
  // título viraria só o endereço — o empreiteiro perderia o que é a obra.
  // Remover "Contratação de" é bom; comer o "obras na" não seria.
  it('em "obras na Rua X" preserva a obra e não deixa só o endereço', () => {
    expect(
      encurtarObjeto(
        'Contratação de obras na Rua Marechal Deodoro, no centro de Blumenau, com drenagem',
      ),
    ).toBe('Obras na Rua Marechal Deodoro, no centro de Blumenau, com drenagem');
  });

  it('não toca em objeto que já começa pela obra', () => {
    const direto =
      'Reforma e ampliação do Centro de Educação Infantil do Bairro Fazenda';
    expect(encurtarObjeto(direto)).toBe(direto);
  });

  it('normaliza quebras de linha e espaços repetidos', () => {
    expect(encurtarObjeto('  Reforma   da\n\nEscola  Municipal Rui Barbosa ')).toBe(
      'Reforma da Escola Municipal Rui Barbosa',
    );
  });

  it('lida com null/undefined/vazio', () => {
    expect(encurtarObjeto(null)).toBe('');
    expect(encurtarObjeto(undefined)).toBe('');
    expect(encurtarObjeto('   ')).toBe('');
  });
});
