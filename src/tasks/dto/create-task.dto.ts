import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Design the login screen' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Include social login buttons' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
