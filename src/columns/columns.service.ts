import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from '../boards/board-access.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boardAccess: BoardAccessService,
  ) {}

  async create(boardId: string, userId: string, dto: CreateColumnDto) {
    await this.boardAccess.assertAccess(boardId, userId);

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.column.findFirst({
        where: { boardId },
        orderBy: { position: 'desc' },
      });
      const nextPosition = last ? last.position + 1 : 0;

      return tx.column.create({
        data: {
          name: dto.name,
          boardId,
          position: nextPosition,
        },
      });
    });
  }

  async findAll(boardId: string, userId: string) {
    await this.boardAccess.assertAccess(boardId, userId);
    return this.prisma.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: { tasks: { orderBy: { position: 'asc' } } },
    });
  }

  async update(columnId: string, userId: string, dto: UpdateColumnDto) {
    const { boardId } = await this.boardAccess.assertColumnAccess(columnId, userId);

    return this.prisma.$transaction(async (tx) => {
      const column = await tx.column.findUniqueOrThrow({ where: { id: columnId } });

      if (dto.position !== undefined && dto.position !== column.position) {
        await this.reorderColumn(tx, boardId, column.id, column.position, dto.position);
      }

      return tx.column.update({
        where: { id: columnId },
        data: { name: dto.name },
      });
    });
  }

  async remove(columnId: string, userId: string): Promise<void> {
    const { boardId } = await this.boardAccess.assertColumnAccess(columnId, userId);

    await this.prisma.$transaction(async (tx) => {
      const column = await tx.column.findUniqueOrThrow({ where: { id: columnId } });
      await tx.column.delete({ where: { id: columnId } });
      await tx.column.updateMany({
        where: { boardId, position: { gt: column.position } },
        data: { position: { decrement: 1 } },
      });
    });
  }

  private async reorderColumn(
    tx: TransactionClient,
    boardId: string,
    columnId: string,
    fromPosition: number,
    toPositionRaw: number,
  ): Promise<void> {
    const columnCount = await tx.column.count({ where: { boardId } });
    const toPosition = Math.max(0, Math.min(toPositionRaw, columnCount - 1));

    if (toPosition === fromPosition) {
      return;
    }

    if (toPosition < fromPosition) {
      await tx.column.updateMany({
        where: { boardId, position: { gte: toPosition, lt: fromPosition } },
        data: { position: { increment: 1 } },
      });
    } else {
      await tx.column.updateMany({
        where: { boardId, position: { gt: fromPosition, lte: toPosition } },
        data: { position: { decrement: 1 } },
      });
    }

    await tx.column.update({ where: { id: columnId }, data: { position: toPosition } });
  }
}
