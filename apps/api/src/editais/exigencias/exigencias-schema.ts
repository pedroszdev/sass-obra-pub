import { CertidaoTipo } from '../../company-profile/certidao-tipo.enum';

// JSON Schema (strict) que a OpenAI usa para garantir a saída estruturada da
// extração de exigências (T-49). As chaves espelham `ExigenciasHabilitacao`
// (camelCase) — a resposta da IA faz JSON.parse direto no tipo. O enum de
// certidão usa os valores de CertidaoTipo (menos REGISTRO_CONSELHO, que tem
// campo próprio) para casar com o perfil/cruzamento (T-44/T-51).
//
// Regras do strict mode da OpenAI: todo objeto com `additionalProperties:false`
// e TODAS as chaves em `required`; campos opcionais viram união com "null".

const CERTIDAO_TIPOS = Object.values(CertidaoTipo).filter(
  (t) => t !== CertidaoTipo.REGISTRO_CONSELHO,
);

const nullableString = { type: ['string', 'null'] };

export const EXIGENCIAS_JSON_SCHEMA = {
  name: 'exigencias_habilitacao',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'resumoObjeto',
      'certidoes',
      'registroConselho',
      'capacidadeTecnica',
      'capitalSocial',
      'garantia',
      'outrosRequisitos',
      'resumo',
    ],
    properties: {
      resumoObjeto: {
        type: 'string',
        description: 'Objeto da licitação em 1 frase',
      },
      certidoes: {
        type: 'array',
        description: 'Certidões/regularidades exigidas para habilitação',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tipo', 'exigida', 'trecho'],
          properties: {
            tipo: { type: 'string', enum: CERTIDAO_TIPOS },
            exigida: { type: 'boolean' },
            trecho: nullableString,
          },
        },
      },
      registroConselho: {
        type: 'object',
        additionalProperties: false,
        required: ['exigido', 'conselho', 'trecho'],
        properties: {
          exigido: { type: 'boolean' },
          conselho: {
            ...nullableString,
            description: 'CREA, CAU, ambos ou null',
          },
          trecho: nullableString,
        },
      },
      capacidadeTecnica: {
        type: 'object',
        additionalProperties: false,
        required: ['exigida', 'descricao', 'trecho'],
        properties: {
          exigida: { type: 'boolean' },
          descricao: {
            ...nullableString,
            description: 'O que os atestados comprovam',
          },
          trecho: nullableString,
        },
      },
      capitalSocial: {
        type: 'object',
        additionalProperties: false,
        required: [
          'exigido',
          'valorMinimoReais',
          'percentualSobreEstimado',
          'trecho',
        ],
        properties: {
          exigido: { type: 'boolean' },
          valorMinimoReais: { type: ['number', 'null'] },
          percentualSobreEstimado: { type: ['number', 'null'] },
          trecho: nullableString,
        },
      },
      garantia: {
        type: 'object',
        additionalProperties: false,
        required: ['exigida', 'trecho'],
        properties: {
          exigida: { type: 'boolean' },
          trecho: nullableString,
        },
      },
      outrosRequisitos: {
        type: 'array',
        description: 'Outras exigências de habilitação não cobertas acima',
        items: { type: 'string' },
      },
      // Resumo de 1 página (T-50) — mesma chamada, foca no que só está no PDF.
      resumo: {
        type: 'object',
        additionalProperties: false,
        required: [
          'visaoGeral',
          'prazoExecucao',
          'datasChave',
          'pontosDeAtencao',
        ],
        properties: {
          visaoGeral: {
            type: 'string',
            description: 'Escopo da obra em 2-4 frases, linguagem simples',
          },
          prazoExecucao: {
            ...nullableString,
            description:
              'Prazo de execução da obra, se informado (ex.: "180 dias")',
          },
          datasChave: {
            type: 'array',
            description:
              'Datas/eventos importantes (sessão, visita técnica, etc.)',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['evento', 'quando'],
              properties: {
                evento: { type: 'string' },
                quando: { type: 'string' },
              },
            },
          },
          pontosDeAtencao: {
            type: 'array',
            description: 'Pontos de atenção reais (visita, garantia, índices…)',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};
