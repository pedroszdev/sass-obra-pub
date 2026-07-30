// Reconhecimento de erros do Postgres que viram resposta de negócio (T-225).
//
// Por que existe: violação de índice único é um caminho ESPERADO (dois cadastros
// com o mesmo CNPJ), não uma falha do servidor. Sem tratar, o TypeORM propaga
// `QueryFailedError` e o Nest devolve 500 — o usuário vê "erro no servidor" para
// algo que ele mesmo pode corrigir.
//
// ⚠️ Checar pelo CÓDIGO do driver (`23505`), não pela mensagem: a mensagem muda
// com a versão do Postgres e com o idioma do servidor.

// unique_violation — https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';

export function violacaoDeUnicidade(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    // O driver expõe o código em `driverError.code`; o TypeORM repassa em `code`
    // dependendo do caminho, então olhamos os dois.
    (temCodigo(error, UNIQUE_VIOLATION) ||
      temCodigo(
        (error as { driverError?: unknown }).driverError,
        UNIQUE_VIOLATION,
      ))
  );
}

function temCodigo(alvo: unknown, codigo: string): boolean {
  return (
    typeof alvo === 'object' &&
    alvo !== null &&
    (alvo as { code?: unknown }).code === codigo
  );
}
