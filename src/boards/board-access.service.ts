import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Board, BoardRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Central authorization helper for board-scoped resources.
 * Every module that touches a board, column, or task must resolve
 * access through here rather than trusting client-provided IDs.
 */
@Injectable()
export class BoardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a board and throws 404 if it doesn't exist.
   */
  async getBoardOrThrow(boardId: string): Promise<Board> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    return board;
  }

  /**
   * Returns the caller's role on a board, or null if they have no access.
   * Owner is always treated as OWNER even without an explicit BoardMember row.
   */
  async getRole(boardId: string, userId: string): Promise<BoardRole | null> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
      return null;
    }
    if (board.ownerId === userId) {
      return BoardRole.OWNER;
    }
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    return membership?.role ?? null;
  }

  /**
   * Ensures the user can access (view/mutate resources on) a board.
   * Throws 404 if the board doesn't exist, 403 if the user has no access.
   */
  async assertAccess(boardId: string, userId: string): Promise<Board> {
    const board = await this.getBoardOrThrow(boardId);
    if (board.ownerId === userId) {
      return board;
    }
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this board');
    }
    return board;
  }

  /**
   * Ensures the user is the owner of the board. Used for destructive or
   * membership-management actions that only the owner may perform.
   */
  async assertOwner(boardId: string, userId: string): Promise<Board> {
    const board = await this.getBoardOrThrow(boardId);
    if (board.ownerId !== userId) {
      throw new ForbiddenException('Only the board owner can perform this action');
    }
    return board;
  }

  /**
   * Resolves the board that a column belongs to and verifies access.
   * Never trusts a client-supplied boardId - always derives it from the column.
   */
  async assertColumnAccess(columnId: string, userId: string): Promise<{ boardId: string }> {
    const column = await this.prisma.column.findUnique({ where: { id: columnId } });
    if (!column) {
      throw new NotFoundException('Column not found');
    }
    await this.assertAccess(column.boardId, userId);
    return { boardId: column.boardId };
  }

  /**
   * Resolves the board that a task belongs to (via its column) and verifies access.
   */
  async assertTaskAccess(taskId: string, userId: string): Promise<{ boardId: string; columnId: string }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { column: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    await this.assertAccess(task.column.boardId, userId);
    return { boardId: task.column.boardId, columnId: task.columnId };
  }
}
