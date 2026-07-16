// Valida o endereço de um documento vindo de FORA antes de baixá-lo.
//
// O conector devolve a URL do arquivo VERBATIM do JSON da fonte (hoje o feed do
// PNCP — ver `rankPncpArquivos`: `a.url ?? a.uri`), e é ela que vai direto para o
// `fetch` da extração. É o único ponto do código que confia num endereço que não
// montamos. A fonte é do governo e fala https, então na prática nada muda — o
// controle existe para o dia em que a Camada 2 (Portal de Compras Públicas, §9)
// trouxer outra fonte, ou em que a atual mude.
//
// SÓ `https:` PASSA. Não é rigor estético — é o que fecha o SSRF clássico de
// graça:
//   - os endpoints de metadados de nuvem (169.254.169.254) só falam HTTP;
//   - serviço interno em texto claro (Postgres, Redis, painel) idem.
// Exigir https barra os dois sem precisar resolver DNS nem manter lista de IP
// privado — e não custa cobertura, porque a fonte real já é https.
//
// HOST fica FORA da allowlist de propósito: o PNCP serve arquivo de CDN, e fixar
// domínio quebraria a extração no dia em que eles mudassem de infra. O ganho seria
// pequeno e a chance de quebrar em produção, grande.
//
// ⚠️ LIMITE CONHECIDO: isto valida o PRIMEIRO endereço, não os saltos seguintes.
// O `fetch` segue redirect por padrão, e um https que redireciona para http seria
// seguido. Não fechamos isso porque `redirect: 'manual'` quebraria o CDN da fonte
// (que redireciona de verdade), e porque quem controlasse o redirect já teria de
// controlar o feed do PNCP — a suposição de confiança que este arquivo assume.
export function assertUrlDocumento(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL de documento inválida: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `URL de documento recusada (só https): ${parsed.protocol}//${parsed.host}`,
    );
  }
}
