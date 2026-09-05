import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from '../boards/board-access.service';
import { UsersService } from '../users/users.service';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class BoardMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boardAccess: BoardAccessService,
    private readonly usersService: UsersService,
  ) {}

  async addMember(boardId: string, requesterId: string, dto: AddMemberDto) {
    await this.boardAccess.assertOwner(boardId, requesterId);

    const targetUser = await this.usersService.findByEmail(dto.email.toLowerCase());
    if (!targetUser) {
      throw new NotFoundException('No registered user found with this email');
    }

    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUser.id } },
    });
    if (existing) {
      throw new ConflictException('This user is already a member of the board');
    }

    return this.prisma.boardMember.create({
      data: {
        boardId,
        userId: targetUser.id,
        role: BoardRole.MEMBER,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async listMembers(boardId: string, requesterId: string) {
    await this.boardAccess.assertAccess(boardId, requesterId);
    return this.prisma.boardMember.findMany({
      where: { boardId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeMember(boardId: string, requesterId: string, targetUserId: string): Promise<void> {
    const board = await this.boardAccess.assertOwner(boardId, requesterId);

    if (board.ownerId === targetUserId) {
      throw new ForbiddenException('The board owner cannot be removed');
    }

    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException('This user is not a member of the board');
    }

    await this.prisma.boardMember.delete({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
  }
}
