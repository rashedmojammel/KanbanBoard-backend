import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-utils';

describe('Task movement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function registerUser(email: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test User', email, password: 'Password123' })
      .expect(201);
    return { token: response.body.accessToken, id: response.body.user.id, email };
  }

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createBoard(token: string) {
    const response = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(token))
      .send({ name: 'Move Test Board' })
      .expect(201);
    return response.body.id as string;
  }

  async function createColumn(token: string, boardId: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`/boards/${boardId}/columns`)
      .set(authed(token))
      .send({ name })
      .expect(201);
    return response.body.id as string;
  }

  async function createTask(token: string, columnId: string, title: string) {
    const response = await request(app.getHttpServer())
      .post(`/columns/${columnId}/tasks`)
      .set(authed(token))
      .send({ title })
      .expect(201);
    return response.body.id as string;
  }

  async function tasksInOrder(token: string, columnId: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get(`/columns/${columnId}/tasks`)
      .set(authed(token))
      .expect(200);
    return response.body
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
      .map((t: { title: string }) => t.title);
  }

  it('moves a task to the front within the same column', async () => {
    const owner = await registerUser('mover1@example.com');
    const boardId = await createBoard(owner.token);
    const columnId = await createColumn(owner.token, boardId, 'To Do');

    await createTask(owner.token, columnId, 'A');
    await createTask(owner.token, columnId, 'B');
    await createTask(owner.token, columnId, 'C');
    const taskD = await createTask(owner.token, columnId, 'D');

    await request(app.getHttpServer())
      .patch(`/tasks/${taskD}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnId, position: 1 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnId)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('moves a task to the last position within the same column', async () => {
    const owner = await registerUser('mover2@example.com');
    const boardId = await createBoard(owner.token);
    const columnId = await createColumn(owner.token, boardId, 'To Do');

    const taskA = await createTask(owner.token, columnId, 'A');
    await createTask(owner.token, columnId, 'B');
    await createTask(owner.token, columnId, 'C');

    await request(app.getHttpServer())
      .patch(`/tasks/${taskA}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnId, position: 2 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnId)).toEqual(['B', 'C', 'A']);
  });

  it('moves a task to position 0 within the same column', async () => {
    const owner = await registerUser('mover3@example.com');
    const boardId = await createBoard(owner.token);
    const columnId = await createColumn(owner.token, boardId, 'To Do');

    await createTask(owner.token, columnId, 'A');
    await createTask(owner.token, columnId, 'B');
    const taskC = await createTask(owner.token, columnId, 'C');

    await request(app.getHttpServer())
      .patch(`/tasks/${taskC}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnId, position: 0 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnId)).toEqual(['C', 'A', 'B']);
  });

  it('moves a task from one column to another at a specific position', async () => {
    const owner = await registerUser('mover4@example.com');
    const boardId = await createBoard(owner.token);
    const columnA = await createColumn(owner.token, boardId, 'A');
    const columnB = await createColumn(owner.token, boardId, 'B');

    await createTask(owner.token, columnA, 'A0');
    const movingTask = await createTask(owner.token, columnA, 'A1(B)');
    await createTask(owner.token, columnA, 'A2');

    await createTask(owner.token, columnB, 'B0');
    await createTask(owner.token, columnB, 'B1');
    await createTask(owner.token, columnB, 'B2');

    await request(app.getHttpServer())
      .patch(`/tasks/${movingTask}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnB, position: 0 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnA)).toEqual(['A0', 'A2']);
    expect(await tasksInOrder(owner.token, columnB)).toEqual(['A1(B)', 'B0', 'B1', 'B2']);
  });

  it('moves a task into an empty column', async () => {
    const owner = await registerUser('mover5@example.com');
    const boardId = await createBoard(owner.token);
    const columnA = await createColumn(owner.token, boardId, 'A');
    const columnB = await createColumn(owner.token, boardId, 'Empty');

    const task = await createTask(owner.token, columnA, 'Only Task');

    await request(app.getHttpServer())
      .patch(`/tasks/${task}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnB, position: 0 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnA)).toEqual([]);
    expect(await tasksInOrder(owner.token, columnB)).toEqual(['Only Task']);
  });

  it('clamps an out-of-range position to the last valid slot instead of erroring', async () => {
    const owner = await registerUser('mover6@example.com');
    const boardId = await createBoard(owner.token);
    const columnA = await createColumn(owner.token, boardId, 'A');
    const columnB = await createColumn(owner.token, boardId, 'B');

    const task = await createTask(owner.token, columnA, 'T');
    await createTask(owner.token, columnB, 'B0');
    await createTask(owner.token, columnB, 'B1');

    await request(app.getHttpServer())
      .patch(`/tasks/${task}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnB, position: 999 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnB)).toEqual(['B0', 'B1', 'T']);
  });

  it('keeps positions contiguous (0..n-1) after several moves and matches the documented example', async () => {
    const owner = await registerUser('mover7@example.com');
    const boardId = await createBoard(owner.token);
    const columnA = await createColumn(owner.token, boardId, 'A');
    const columnB = await createColumn(owner.token, boardId, 'B');

    await createTask(owner.token, columnA, 'A');
    const taskB = await createTask(owner.token, columnA, 'B');
    await createTask(owner.token, columnA, 'C');

    await createTask(owner.token, columnB, 'D');
    await createTask(owner.token, columnB, 'E');

    // Move B from column A (position 1) to column B at position 0.
    await request(app.getHttpServer())
      .patch(`/tasks/${taskB}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnB, position: 0 })
      .expect(200);

    expect(await tasksInOrder(owner.token, columnA)).toEqual(['A', 'C']);
    expect(await tasksInOrder(owner.token, columnB)).toEqual(['B', 'D', 'E']);

    const columnATasks = await request(app.getHttpServer())
      .get(`/columns/${columnA}/tasks`)
      .set(authed(owner.token))
      .expect(200);
    const columnBTasks = await request(app.getHttpServer())
      .get(`/columns/${columnB}/tasks`)
      .set(authed(owner.token))
      .expect(200);

    expect(columnATasks.body.map((t: { position: number }) => t.position).sort()).toEqual([0, 1]);
    expect(columnBTasks.body.map((t: { position: number }) => t.position).sort()).toEqual([0, 1, 2]);
  });

  it('rejects moving a task into a column that belongs to a different board', async () => {
    const owner = await registerUser('mover8@example.com');
    const boardOne = await createBoard(owner.token);
    const boardTwo = await createBoard(owner.token);
    const columnOne = await createColumn(owner.token, boardOne, 'A');
    const columnTwo = await createColumn(owner.token, boardTwo, 'B');

    const task = await createTask(owner.token, columnOne, 'Task');

    await request(app.getHttpServer())
      .patch(`/tasks/${task}/move`)
      .set(authed(owner.token))
      .send({ targetColumnId: columnTwo, position: 0 })
      .expect(403);
  });

  it('rejects a move request from a user who has no access to the board', async () => {
    const owner = await registerUser('mover9@example.com');
    const outsider = await registerUser('outsider9@example.com');
    const boardId = await createBoard(owner.token);
    const columnId = await createColumn(owner.token, boardId, 'A');
    const task = await createTask(owner.token, columnId, 'Task');

    await request(app.getHttpServer())
      .patch(`/tasks/${task}/move`)
      .set(authed(outsider.token))
      .send({ targetColumnId: columnId, position: 0 })
      .expect(403);
  });
});
