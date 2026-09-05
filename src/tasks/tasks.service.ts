import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from '../boards/board-access.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boardAccess: BoardAccessService,
  ) {}

  async create(columnId: string, userId: string, dto: CreateTaskDto) {
    await this.boardAccess.assertColumnAccess(columnId, userId);

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.task.findFirst({
        where: { columnId },
        orderBy: { position: 'desc' },
      });
      const nextPosition = last ? last.position + 1 : 0;

      return tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          columnId,
          position: nextPosition,
        },
      });
    });
  }

  async findAllByColumn(columnId: string, userId: string) {
    await this.boardAccess.assertColumnAccess(columnId, userId);
    return this.prisma.task.findMany({
      where: { columnId },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(taskId: string, userId: string) {
    await this.boardAccess.assertTaskAccess(taskId, userId);
    return this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  }

  async update(taskId: string, userId: string, dto: UpdateTaskDto) {
    await this.boardAccess.assertTaskAccess(taskId, userId);
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
      },
    });
  }

  async remove(taskId: string, userId: string): Promise<void> {
    await this.boardAccess.assertTaskAccess(taskId, userId);

    await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      await tx.task.delete({ where: { id: taskId } });
      await tx.task.updateMany({
        where: { columnId: task.columnId, position: { gt: task.position } },
        data: { position: { decrement: 1 } },
      });
    });
  }

  /**
   * Moves a task within its current column or into another column of the
   * same board, at a specific target position. All position bookkeeping
   * happens inside a single transaction to keep ordering consistent.
   */
  async move(taskId: string, userId: string, dto: MoveTaskDto) {
    const { boardId: sourceBoardId } = await this.boardAccess.assertTaskAccess(taskId, userId);

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const targetColumn = await tx.column.findUnique({ where: { id: dto.targetColumnId } });
      if (!targetColumn) {
        throw new NotFoundException('Target column not found');
      }
      if (targetColumn.boardId !== sourceBoardId) {
        throw new ForbiddenException('Cannot move a task to a column on a different board');
      }

      const sourceColumnId = task.columnId;
      const oldPosition = task.position;
      const targetColumnId = targetColumn.id;

      if (sourceColumnId === targetColumnId) {
        const taskCount = await tx.task.count({ where: { columnId: sourceColumnId } });
        const newPosition = this.clampPosition(dto.position, taskCount - 1);

        if (newPosition === oldPosition) {
          return task;
        }

        if (newPosition < oldPosition) {
          await tx.task.updateMany({
            where: {
              columnId: sourceColumnId,
              position: { gte: newPosition, lt: oldPosition },
            },
            data: { position: { increment: 1 } },
          });
        } else {
          await tx.task.updateMany({
            where: {
              columnId: sourceColumnId,
              position: { gt: oldPosition, lte: newPosition },
            },
            data: { position: { decrement: 1 } },
          });
        }

        return tx.task.update({
          where: { id: taskId },
          data: { position: newPosition },
        });
      }

      const targetCount = await tx.task.count({ where: { columnId: targetColumnId } });
      const newPosition = this.clampPosition(dto.position, targetCount);

      // Close the gap left behind in the source column.
      await tx.task.updateMany({
        where: { columnId: sourceColumnId, position: { gt: oldPosition } },
        data: { position: { decrement: 1 } },
      });

      // Open a slot in the target column.
      await tx.task.updateMany({
        where: { columnId: targetColumnId, position: { gte: newPosition } },
        data: { position: { increment: 1 } },
      });

      return tx.task.update({
        where: { id: taskId },
        data: { columnId: targetColumnId, position: newPosition },
      });
    });
  }

  private clampPosition(requested: number, maxIndex: number): number {
    const upperBound = Math.max(maxIndex, 0);
    if (requested < 0) return 0;
    if (requested > upperBound) return upperBound;
    return requested;
  }
}
