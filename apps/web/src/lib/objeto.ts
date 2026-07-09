// Encurtamento determinístico do objeto do edital (sem IA).
//
// O objeto vem do PNCP com preâmbulo burocrático: na base de dev, **1.025 dos
// 1.635** editais de obra (63%) começam com "Contratação de empresa
// especializada para execução de...". Isso não é informação — é fórmula — e
// come as duas linhas visíveis do card, empurrando o que importa (a obra, a rua,
// o bairro) para fora da tela.
//
// Por que não usar IA: o campo `resumoObjeto` já existe na extração (T-49) e sai
// de graça na mesma chamada, MAS (a) só existe para editais analisados — hoje
// uma fração da base — e (b) nunca teve o acerto medido (§3.4: não mostrar saída
// de IA sem medir a taxa de erro). O título é o identificador primário do edital:
// "reforma" virar "construção" faria o empreiteiro agir sobre dado errado.
//
// Regras: só REMOVEMOS preâmbulo; nunca reescrevemos, resumimos ou cortamos o
// meio do texto. O objeto completo continua acessível no detalhe do edital.

// Tag da origem: "[Portal de Compras Públicas] - ..."
const TAG_ORIGEM = /^\s*\[[^\]]{0,60}\]\s*[-–—:]*\s*/i;

// Fórmulas que só anunciam que existe um objeto, sem dizer qual.
// ⚠️ `ref` e `objeto` EXIGEM a pontuação (`.` ou `:`). Sem isso, `ref\.?:?`
// casava o "Ref" de "Reforma" e "Reforma da Escola" virava "Orma da Escola" —
// bug pego pelos testes, e valeria para todo edital de reforma da base.
const ABERTURA = new RegExp(
  '^\\s*(' +
    'ref\\s*[.:]\\s*|' +
    'objeto\\s*:\\s*|' +
    'abertura de processo licitatório para\\s*|' +
    '(a\\s+)?presente\\s+(licitação|demanda|procedimento licitatório|processo)\\s+tem (por|como) (objeto|objetivo)\\s*(?:(?:a|o)\\s+)?|' +
    'o presente procedimento licitatório tem (por|como) (objeto|objetivo)\\s*(?:(?:a|o)\\s+)?|' +
    'o objeto (da|desta) (presente\\s+)?licitação (é|e|consiste em)\\s*(?:(?:a|o)\\s+)?|' +
    'constitui(-se)? objeto (da|desta) (presente\\s+)?licitação\\s*(?:(?:a|o)\\s+)?|' +
    // "CONCORRÊNCIA ELETRÔNICA PARA contratação de ...", "Pregão eletrônico para ..."
    '(concorr[êe]ncia|preg[ãa]o|tomada de pre[çc]os|dispensa)(\\s+eletr[ôo]nic[ao]|\\s+presencial)?\\s+(para|visando)\\s*(?:(?:a|o)\\s+)?' +
    ')',
  'i',
);

// O núcleo. O miolo entre "contratação de" e "para" varia muito na base
// ("empresa especializada", "empresa especializada no ramo da construção civil",
// "obras e serviços de engenharia", "obra comum de engenharia"), então casamos
// um trecho curto e não-guloso — mas EXIGINDO que ele comece por empresa/obra/
// serviço/pessoa jurídica. Sem essa âncora, "Contratação de pavimentação para o
// bairro X" viraria "O bairro X".
const CONTRATACAO = new RegExp(
  '^\\s*contrata[çc][ãa]o\\s+de\\s+' +
    '(empresa|pessoa\\s+jur[íi]dica|obras?|servi[çc]os?)' +
    '[\\wÀ-ÿ\\s,\\-]{0,60}?' +
    // "…para a", "…visando o", ou "…na realização de". `na|no` só valem diante de
    // um verbo de execução: sem o lookahead, "Contratação de obras na Rua X"
    // viraria "Rua X".
    '\\s+(?:(?:para|visando)\\s*(?:(?:a|o)\\s+)?' +
    '|(?:na|no)\\s+(?=execu|realiza|presta|elabora|constru|reforma|pavimenta))',
  'i',
);

// Quando não há "para" (ex.: "Contratação de serviços de obra e engenharia COM
// fornecimento de materiais"), removemos ao menos o verbo burocrático. O
// lookahead garante que sobre uma obra/serviço, não um endereço solto.
const CONTRATACAO_SIMPLES =
  /^\s*contrata[çc][ãa]o\s+de\s+(?=obras?\b|servi[çc]os?\b)/i;

// O resto: "execução de obras de", "prestação dos serviços de", "elaboração de".
const EXECUCAO = new RegExp(
  '^\\s*(execu[çc][ãa]o|presta[çc][ãa]o|realiza[çc][ãa]o|elabora[çc][ãa]o|fornecimento)' +
    '\\s+(de|dos|das|do|da)?\\s*' +
    '((obras?|servi[çc]os?)\\s+(de|do|da|dos|das)\\s+)?',
  'i',
);

// Abaixo disto o preâmbulo comeu o objeto inteiro (ex.: "Contratação de empresa
// especializada" e nada mais) — devolvemos o original em vez de um título vazio.
const MIN_UTIL = 25;

/**
 * Remove o preâmbulo burocrático do objeto do edital. Puro e determinístico.
 * Se sobrar pouco demais, devolve o objeto original — nunca um título vazio.
 */
export function encurtarObjeto(objeto: string | null | undefined): string {
  const original = (objeto ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return '';

  let texto = original;
  for (const regex of [
    TAG_ORIGEM,
    ABERTURA,
    CONTRATACAO,
    CONTRATACAO_SIMPLES,
    EXECUCAO,
  ]) {
    texto = texto.replace(regex, '');
  }
  texto = texto.replace(/^[\s,;:.\-–—]+/, '').trim();

  if (texto.length < MIN_UTIL) return original;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
