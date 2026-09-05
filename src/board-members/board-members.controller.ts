import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BoardMembersService } from './board-members.service';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('board-members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('boards/:boardId/members')
export class BoardMembersController {
  constructor(private readonly boardMembersService: BoardMembersService) {}

  @Post()
  @ApiOperation({ summary: 'Share a board with a registered user (owner only)' })
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.boardMembersService.addMember(boardId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List members of a board' })
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('boardId', ParseUUIDPipe) boardId: string) {
    return this.boardMembersService.listMembers(boardId, user.id);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Remove a member from a board (owner only)' })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.boardMembersService.removeMember(boardId, user.id, userId);
  }
}
