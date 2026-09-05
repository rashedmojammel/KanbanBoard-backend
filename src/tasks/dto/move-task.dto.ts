import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({
    example: 'b3f1a2c4-9d3e-4b1a-8f2e-7a6c5d4e3f21',
    description: 'Column to move the task into',
  })
  @IsUUID()
  targetColumnId!: string;

  @ApiProperty({ example: 1, description: 'Zero-based target position within the target column' })
  @IsInt()
  @Min(0)
  position!: number;
}
