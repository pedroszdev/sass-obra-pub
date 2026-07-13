import { IsString, MaxLength } from 'class-validator';

// Corpo do POST que o GOOGLE envia ao callback do fluxo por redirect (T-126b).
// É `application/x-www-form-urlencoded`, não JSON, e vem com campos que não nos
// interessam (`g_csrf_token`, `select_by`) — por isso o handler usa um
// ValidationPipe próprio, que descarta o excedente em vez de recusar o pedido.
export class GoogleCallbackDto {
  // O id_token assinado pelo Google.
  @IsString()
  @MaxLength(4096)
  credential!: string;
}
