import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const FEEDBACK_STATUS = ['novo', 'lido', 'resolvido'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS)[number];

export class ListFeedbackDto {
  @IsOptional()
  @IsIn(FEEDBACK_STATUS)
  status?: FeedbackStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class UpdateFeedbackStatusDto {
  @IsIn(FEEDBACK_STATUS)
  status!: FeedbackStatus;
}
