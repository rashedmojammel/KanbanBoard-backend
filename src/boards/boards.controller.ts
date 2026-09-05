import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new board (creator becomes the owner)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List boards the current user owns or is a member of' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.boardsService.findAllForUser(user.id);
  }

  @Get(':boardId')
  @ApiOperation({ summary: 'Get a board with its columns and tasks' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('boardId', ParseUUIDPipe) boardId: string) {
    return this.boardsService.findOne(boardId, user.id);
  }

  @Patch(':boardId')
  @ApiOperation({ summary: 'Update a board (owner only)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(boardId, user.id, dto);
  }

  @Delete(':boardId')
  @ApiOperation({ summary: 'Delete a board (owner only)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('boardId', ParseUUIDPipe) boardId: string) {
    return this.boardsService.remove(boardId, user.id);
  }
}
