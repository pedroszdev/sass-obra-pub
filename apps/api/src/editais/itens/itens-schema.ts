// JSON Schema (strict) que a OpenAI usa para garantir a saída estruturada da
// extração da planilha de itens (T-64). As chaves espelham `ExtracaoItensIa`
// (camelCase) — a resposta da IA faz JSON.parse direto no tipo. Regras do strict
// mode: objeto com additionalProperties:false e TODAS as chaves em required;
// campos opcionais viram união com "null".

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };

export const ITENS_JSON_SCHEMA = {
  name: 'planilha_orcamentaria',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['temPlanilha', 'itens'],
    properties: {
      temPlanilha: { type: 'boolean' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'codigo',
            'descricao',
            'unidade',
            'quantidade',
            'precoReferencia',
          ],
          properties: {
            codigo: nullableString,
            descricao: { type: 'string' },
            unidade: nullableString,
            quantidade: nullableNumber,
            precoReferencia: nullableNumber,
          },
        },
      },
    },
  },
};
