import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardAccessService } from './board-access.service';

@Module({
  controllers: [BoardsController],
  providers: [BoardsService, BoardAccessService],
  exports: [BoardAccessService],
})
export class BoardsModule {}
