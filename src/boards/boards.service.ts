import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from './board-access.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { BoardRole } from '@prisma/client';

const boardDetailInclude = {
  owner: { select: { id: true, name: true, email: true } },
  columns: {
    orderBy: { position: 'asc' as const },
    include: {
      tasks: { orderBy: { position: 'asc' as const } },
    },
  },
};

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boardAccess: BoardAccessService,
  ) {}

  async create(ownerId: string, dto: CreateBoardDto) {
    const board = await this.prisma.board.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId,
        members: {
          create: {
            userId: ownerId,
            role: BoardRole.OWNER,
          },
        },
      },
      include: boardDetailInclude,
    });
    return board;
  }

  async findAllForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { columns: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (boards.length === 0) {
      return boards;
    }

    const taskCounts = await this.prisma.task.groupBy({
      by: ['columnId'],
      where: { column: { boardId: { in: boards.map((b) => b.id) } } },
      _count: { _all: true },
    });

    const columnToBoard = await this.prisma.column.findMany({
      where: { boardId: { in: boards.map((b) => b.id) } },
      select: { id: true, boardId: true },
    });
    const columnBoardMap = new Map(columnToBoard.map((c) => [c.id, c.boardId]));

    const taskCountByBoard = new Map<string, number>();
    for (const entry of taskCounts) {
      const boardId = columnBoardMap.get(entry.columnId);
      if (!boardId) continue;
      taskCountByBoard.set(boardId, (taskCountByBoard.get(boardId) ?? 0) + entry._count._all);
    }

    return boards.map((board) => ({
      ...board,
      taskCount: taskCountByBoard.get(board.id) ?? 0,
    }));
  }

  async findOne(boardId: string, userId: string) {
    await this.boardAccess.assertAccess(boardId, userId);
    return this.prisma.board.findUnique({
      where: { id: boardId },
      include: boardDetailInclude,
    });
  }

  async update(boardId: string, userId: string, dto: UpdateBoardDto) {
    await this.boardAccess.assertOwner(boardId, userId);
    return this.prisma.board.update({
      where: { id: boardId },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: boardDetailInclude,
    });
  }

  async remove(boardId: string, userId: string): Promise<void> {
    await this.boardAccess.assertOwner(boardId, userId);
    await this.prisma.board.delete({ where: { id: boardId } });
  }
}
