import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from '../boards/board-access.service';

describe('TasksService.move', () => {
  let service: TasksService;
  let tx: {
    task: { findUnique: jest.Mock; count: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    column: { findUnique: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };
  let boardAccess: { assertTaskAccess: jest.Mock };

  beforeEach(() => {
    tx = {
      task: {
        findUnique: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
      column: { findUnique: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    };
    boardAccess = {
      assertTaskAccess: jest.fn().mockResolvedValue({ boardId: 'board-1', columnId: 'col-source' }),
    };

    service = new TasksService(
      prisma as unknown as PrismaService,
      boardAccess as unknown as BoardAccessService,
    );
  });

  it('shifts tasks between the old and new position when moving earlier within the same column', async () => {
    tx.task.findUnique.mockResolvedValue({ id: 'task-1', columnId: 'col-source', position: 3 });
    tx.column.findUnique.mockResolvedValue({ id: 'col-source', boardId: 'board-1' });
    tx.task.count.mockResolvedValue(4);

    await service.move('task-1', 'user-1', { targetColumnId: 'col-source', position: 1 });

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { columnId: 'col-source', position: { gte: 1, lt: 3 } },
      data: { position: { increment: 1 } },
    });
    expect(tx.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { position: 1 } });
  });

  it('closes the source gap and opens a target slot when moving across columns', async () => {
    tx.task.findUnique.mockResolvedValue({ id: 'task-1', columnId: 'col-source', position: 1 });
    tx.column.findUnique.mockResolvedValue({ id: 'col-target', boardId: 'board-1' });
    tx.task.count.mockResolvedValue(2); // two tasks currently in target column

    await service.move('task-1', 'user-1', { targetColumnId: 'col-target', position: 0 });

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { columnId: 'col-source', position: { gt: 1 } },
      data: { position: { decrement: 1 } },
    });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { columnId: 'col-target', position: { gte: 0 } },
      data: { position: { increment: 1 } },
    });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { columnId: 'col-target', position: 0 },
    });
  });

  it('clamps a position beyond the end of the target column to the last valid slot', async () => {
    tx.task.findUnique.mockResolvedValue({ id: 'task-1', columnId: 'col-source', position: 0 });
    tx.column.findUnique.mockResolvedValue({ id: 'col-target', boardId: 'board-1' });
    tx.task.count.mockResolvedValue(3);

    await service.move('task-1', 'user-1', { targetColumnId: 'col-target', position: 999 });

    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { columnId: 'col-target', position: 3 },
    });
  });

  it('rejects moving into a column belonging to a different board', async () => {
    tx.task.findUnique.mockResolvedValue({ id: 'task-1', columnId: 'col-source', position: 0 });
    tx.column.findUnique.mockResolvedValue({ id: 'col-target', boardId: 'other-board' });

    await expect(
      service.move('task-1', 'user-1', { targetColumnId: 'col-target', position: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when the target column does not exist', async () => {
    tx.task.findUnique.mockResolvedValue({ id: 'task-1', columnId: 'col-source', position: 0 });
    tx.column.findUnique.mockResolvedValue(null);

    await expect(
      service.move('task-1', 'user-1', { targetColumnId: 'missing-column', position: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
