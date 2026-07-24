import { SetMetadata } from '@nestjs/common';

// Chave lida pelo ImpersonationReadOnlyInterceptor (T-187).
export const ALLOW_DURING_IMPERSONATION = 'allowDuringImpersonation';

// Libera uma rota de MUTAÇÃO durante a impersonação (T-187). Por padrão o
// interceptor barra todo POST/PUT/PATCH/DELETE quando a sessão é de "ver como";
// esta anotação é a exceção — só para o que PRECISA rodar mesmo assim: sair da
// impersonação e o logout (que também a encerra). NÃO use para liberar ação de
// produto: a garantia da T-187 é que nada é escrito na conta do cliente.
export const AllowDuringImpersonation = () =>
  SetMetadata(ALLOW_DURING_IMPERSONATION, true);
