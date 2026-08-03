import type { Plano, PrecosResponse } from '../types/auth';

// Resumo do pedido no checkout. Função PURA e testada porque é DINHEIRO na tela:
// um número errado aqui não é bug de layout, é o cliente concordando com uma
// cobrança diferente da que vai acontecer.
//
// ⚠️ Nenhum preço nasce neste arquivo. Os valores vêm de
// `GET /assinaturas/precos` (config store, T-213) — escrever um número no front
// faria a tela mentir no dia seguinte a uma mudança no /admin.

/** Uma linha do resumo. `valorCentavos` negativo = desconto. */
export interface LinhaResumo {
  rotulo: string;
  valorCentavos: number;
  /** Desconto e cortesia aparecem em verde; o resto, neutro. */
  destaque?: 'desconto' | 'gratis';
}

export interface ResumoPedido {
  linhas: LinhaResumo[];
  /** O que sai do cartão AGORA. Zero quando o trial ainda cobre. */
  cobrancaHojeCentavos: number;
  /** Valor da cobrança recorrente, depois que a gratuidade acabar. */
  valorRecorrenteCentavos: number;
  /** Quando cai a 1ª cobrança. `null` = hoje. */
  primeiraCobranca: Date | null;
  /** Meses entre cobranças — o texto do rodapé precisa dizer isso. */
  mesesDoCiclo: number;
}

/**
 * Monta o resumo do pedido.
 *
 * 🔴 **`primeiraCobranca` PRECISA espelhar a `dataDaPrimeiraCobranca` do
 * backend** (`acesso.ts`), que é quem manda a data para o Asaas. Esta função
 * apenas RENDERIZA a mesma regra (§3.3) — se as duas divergirem, a tela promete
 * uma data e o provedor cobra noutra, que é o pior tipo de erro num checkout.
 *
 * A regra, dos dois lados: trial com dias restantes adia a 1ª cobrança para o
 * fim do trial; senão, cobra hoje.
 */
export function montarResumo(
  plano: Plano,
  precos: PrecosResponse,
  trialEndsAt: Date | null,
  now: Date = new Date(),
): ResumoPedido {
  const preco = plano === 'anual' ? precos.anual : precos.mensal;
  const mesesDoCiclo = plano === 'anual' ? 12 : 1;

  const trialAtivo = trialEndsAt != null && trialEndsAt.getTime() > now.getTime();
  const primeiraCobranca = trialAtivo ? trialEndsAt : null;

  const linhas: LinhaResumo[] = [
    { rotulo: nomeDoPlano(plano), valorCentavos: preco.valor },
  ];

  // O desconto do anual é INFORMATIVO: o `preco.valor` do anual já é o valor
  // final cobrado. Mostrar a linha e depois somá-la cobraria duas vezes — por
  // isso ela não entra na conta de `cobrancaHoje`, só explica o preço.
  const desconto = descontoAnualCentavos(plano, precos);
  if (desconto > 0) {
    linhas.push({
      rotulo: rotuloDesconto(precos.mesesGratis),
      valorCentavos: -desconto,
      destaque: 'desconto',
    });
  }

  if (trialAtivo) {
    const dias = diasRestantes(trialEndsAt, now);
    linhas.push({
      rotulo: `Teste grátis (${dias} ${dias === 1 ? 'dia' : 'dias'})`,
      valorCentavos: 0,
      destaque: 'gratis',
    });
  }

  return {
    linhas,
    cobrancaHojeCentavos: trialAtivo ? 0 : preco.valor,
    valorRecorrenteCentavos: preco.valor,
    primeiraCobranca,
    mesesDoCiclo,
  };
}

/**
 * Quanto o anual economiza, em centavos.
 *
 * ⚠️ Sai de `economiaAnual`, que o BACKEND calcula a partir dos dois preços
 * reais (`compararPlanos`) — não de uma conta refeita aqui. Duas contas para o
 * mesmo número é como a tela passa a divergir da cobrança.
 */
function descontoAnualCentavos(
  plano: Plano,
  precos: PrecosResponse,
): number {
  if (plano !== 'anual') return 0;
  return precos.economiaAnual ?? 0;
}

function rotuloDesconto(mesesGratis: number | null): string {
  if (!mesesGratis || mesesGratis < 1) return 'Desconto anual';
  return `Desconto anual (${mesesGratis} ${mesesGratis === 1 ? 'mês' : 'meses'})`;
}

function nomeDoPlano(plano: Plano): string {
  return plano === 'anual' ? 'Plano anual' : 'Plano mensal';
}

/** Dias inteiros até `fim`, arredondando para CIMA — mesma regra do backend:
 *  quem ainda tem 6 horas de trial não pode ler "0 dias". */
export function diasRestantes(fim: Date | null, now: Date = new Date()): number {
  if (!fim) return 0;
  const ms = fim.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
