import { ArrayMaxSize, IsArray, Matches } from 'class-validator';

// Preferência de municípios de atuação (BACKLOG T-94). O PUT manda a lista
// COMPLETA desejada (semântica de replace). Cada código é o do IBGE (7 dígitos);
// a existência real é validada no service contra a base de municípios.
export class MunicipiosPreferidosDto {
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^\d{7}$/, {
    each: true,
    message: 'cada codigoIbge deve ter 7 dígitos',
  })
  codigosIbge!: string[];
}
