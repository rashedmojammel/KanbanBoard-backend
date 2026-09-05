import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class UpdateColumnDto {
  @ApiPropertyOptional({ example: 'In Progress' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 2, description: 'New zero-based position among the board columns' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
