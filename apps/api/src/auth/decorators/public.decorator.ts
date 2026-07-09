import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Abre UMA rota dentro de um controller protegido por `@UseGuards(JwtAuthGuard)`.
 *
 * Necessário porque guards de método são SOMADOS aos do controller, nunca os
 * substituem — não dá para "desligar" o guard só numa rota sem metadata. A
 * alternativa (um controller separado com o mesmo prefixo) dependeria da ordem
 * de registro das rotas para `/editais/stats` não cair no `/editais/:id`.
 *
 * Use com parcimônia: cada rota pública é superfície de ataque. Sempre com
 * throttle e sem dado de usuário.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
