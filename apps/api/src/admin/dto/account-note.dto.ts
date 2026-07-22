import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAccountNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  texto!: string;
}
