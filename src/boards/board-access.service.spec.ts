import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BoardRole } from '@prisma/client';
import { BoardAccessService } from './board-access.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BoardAccessService', () => {
  let service: BoardAccessService;
  let prisma: {
    board: { findUnique: jest.Mock };
    boardMember: { findUnique: jest.Mock };
    column: { findUnique: jest.Mock };
    task: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      board: { findUnique: jest.fn() },
      boardMember: { findUnique: jest.fn() },
      column: { findUnique: jest.fn() },
      task: { findUnique: jest.fn() },
    };
    service = new BoardAccessService(prisma as unknown as PrismaService);
  });

  describe('assertAccess', () => {
    it('throws NotFoundException when the board does not exist', async () => {
      prisma.board.findUnique.mockResolvedValue(null);
      await expect(service.assertAccess('board-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('grants access to the owner without needing a BoardMember row', async () => {
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'user-1' });
      await expect(service.assertAccess('board-1', 'user-1')).resolves.toEqual({
        id: 'board-1',
        ownerId: 'user-1',
      });
      expect(prisma.boardMember.findUnique).not.toHaveBeenCalled();
    });

    it('grants access to a user with a BoardMember row', async () => {
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'owner-id' });
      prisma.boardMember.findUnique.mockResolvedValue({ boardId: 'board-1', userId: 'user-2' });
      await expect(service.assertAccess('board-1', 'user-2')).resolves.toBeDefined();
    });

    it('throws ForbiddenException for a user with no relationship to the board', async () => {
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'owner-id' });
      prisma.boardMember.findUnique.mockResolvedValue(null);
      await expect(service.assertAccess('board-1', 'stranger-id')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertOwner', () => {
    it('throws ForbiddenException when the user is only a member, not the owner', async () => {
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'owner-id' });
      await expect(service.assertOwner('board-1', 'member-id')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('succeeds when the user is the owner', async () => {
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'owner-id' });
      await expect(service.assertOwner('board-1', 'owner-id')).resolves.toBeDefined();
    });
  });

  describe('assertTaskAccess', () => {
    it('resolves the board through the task -> column relationship, never trusting a client-supplied boardId', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        columnId: 'col-1',
        column: { id: 'col-1', boardId: 'board-1' },
      });
      prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'user-1' });

      const result = await service.assertTaskAccess('task-1', 'user-1');
      expect(result).toEqual({ boardId: 'board-1', columnId: 'col-1' });
    });

    it('throws NotFoundException when the task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);
      await expect(service.assertTaskAccess('missing-task', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('getRole returns OWNER for the board owner and null for someone with no access', async () => {
    prisma.board.findUnique.mockResolvedValue({ id: 'board-1', ownerId: 'owner-id' });
    await expect(service.getRole('board-1', 'owner-id')).resolves.toBe(BoardRole.OWNER);

    prisma.boardMember.findUnique.mockResolvedValue(null);
    await expect(service.getRole('board-1', 'stranger-id')).resolves.toBeNull();
  });
});
