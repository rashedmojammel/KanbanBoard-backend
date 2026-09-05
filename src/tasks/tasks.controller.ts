import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('columns/:columnId/tasks')
  @ApiOperation({ summary: 'Create a task in a column' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(columnId, user.id, dto);
  }

  @Get('columns/:columnId/tasks')
  @ApiOperation({ summary: 'List tasks in a column' })
  findAllByColumn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('columnId', ParseUUIDPipe) columnId: string,
  ) {
    return this.tasksService.findAllByColumn(columnId, user.id);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get a single task' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasksService.findOne(taskId, user.id);
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Update a task title/description' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(taskId, user.id, dto);
  }

  @Delete('tasks/:taskId')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasksService.remove(taskId, user.id);
  }

  @Patch('tasks/:taskId/move')
  @ApiOperation({ summary: 'Move a task within or across columns to a specific position' })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasksService.move(taskId, user.id, dto);
  }
}
