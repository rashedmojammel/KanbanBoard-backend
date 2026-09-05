import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: 'Product Roadmap' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'Tracks features for the next release' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
