import { IsOptional, IsString, MaxLength } from 'class-validator';

// Corpo do POST que o GOOGLE envia ao callback do fluxo por redirect (T-126b).
// É `application/x-www-form-urlencoded`, não JSON.
//
// Os campos abaixo do `credential` NÃO nos servem para nada — estão declarados
// só para EXISTIR: o ValidationPipe global roda com `forbidNonWhitelisted`, e
// pipes em NestJS são cumulativos (um pipe no handler não desliga o global), então
// qualquer campo não declarado faz o Google levar um 400 na cara do usuário.
// Se um dia o Google acrescentar outro campo ao form, ele entra aqui.
export class GoogleCallbackDto {
  // O id_token assinado pelo Google. É o único que lemos.
  @IsString()
  @MaxLength(4096)
  credential!: string;

  // Anti-CSRF do Google. Ignorado de propósito: ele só fecha quando o callback é
  // do mesmo site da página, e o nosso vive em outro domínio — no lugar dele
  // usamos um nonce nosso (ver google-nonce-cookie.ts).
  @IsOptional()
  @IsString()
  @MaxLength(256)
  g_csrf_token?: string;

  // Como o usuário escolheu a conta ("btn", "user"…): telemetria do Google.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  select_by?: string;

  // O Google manda o client id nas duas grafias, dependendo do fluxo. Não o
  // usamos: a audiência já é conferida contra o NOSSO client id na verificação
  // do id_token — confiar neste campo do corpo não teria valor nenhum.
  @IsOptional()
  @IsString()
  @MaxLength(256)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  client_id?: string;
}
