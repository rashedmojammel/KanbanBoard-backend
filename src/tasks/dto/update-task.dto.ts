import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Design the login screen (v2)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Include social login buttons and SSO' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
