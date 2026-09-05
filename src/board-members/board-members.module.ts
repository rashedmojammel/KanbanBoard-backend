import { Module } from '@nestjs/common';
import { BoardMembersController } from './board-members.controller';
import { BoardMembersService } from './board-members.service';
import { BoardsModule } from '../boards/boards.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [BoardsModule, UsersModule],
  controllers: [BoardMembersController],
  providers: [BoardMembersService],
})
export class BoardMembersModule {}
