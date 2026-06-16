import { IsJWT } from 'class-validator';

// Usado tanto no /auth/refresh quanto no /auth/logout.
export class RefreshDto {
  @IsJWT()
  refreshToken!: string;
}
