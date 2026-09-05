import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('columns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post('boards/:boardId/columns')
  @ApiOperation({ summary: 'Create a column on a board' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columnsService.create(boardId, user.id, dto);
  }

  @Get('boards/:boardId/columns')
  @ApiOperation({ summary: 'List columns of a board' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('boardId', ParseUUIDPipe) boardId: string) {
    return this.columnsService.findAll(boardId, user.id);
  }

  @Patch('columns/:columnId')
  @ApiOperation({ summary: 'Rename or reposition a column' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columnsService.update(columnId, user.id, dto);
  }

  @Delete('columns/:columnId')
  @ApiOperation({ summary: 'Delete a column and its tasks' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('columnId', ParseUUIDPipe) columnId: string) {
    return this.columnsService.remove(columnId, user.id);
  }
}
