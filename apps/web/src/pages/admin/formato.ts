// Formatadores de dinheiro do admin. Módulo próprio (não dentro de um arquivo
// de componente) porque exportar não-componente de um .tsx de tela quebra o
// fast refresh — é o que o lint react-refresh/only-export-components acusa.
//
// São duas moedas de propósito e elas NÃO se somam: a receita vem da Stripe em
// BRL, o custo de IA vem da OpenAI em USD, e não há câmbio no sistema.

// USD com casas suficientes para valores pequenos de IA (fração de centavo).
export function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

// Centavos → moeda. BRL sai formatado em pt-BR; qualquer outra moeda sai com o
// código ao lado, para não fingir localização que não temos.
export function brlDeCentavos(c: number, moeda: string): string {
  const v = c / 100;
  return moeda.toLowerCase() === 'brl'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : `${v.toFixed(2)} ${moeda.toUpperCase()}`;
}
