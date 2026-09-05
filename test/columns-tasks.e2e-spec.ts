import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-utils';

describe('Columns and tasks (e2e)', () => {
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

  async function createBoard(token: string, name = 'Board') {
    const response = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(token))
      .send({ name })
      .expect(201);
    return response.body.id as string;
  }

  async function createColumn(token: string, boardId: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`/boards/${boardId}/columns`)
      .set(authed(token))
      .send({ name })
      .expect(201);
    return response.body;
  }

  it('creates columns with automatically increasing positions', async () => {
    const owner = await registerUser('colowner@example.com');
    const boardId = await createBoard(owner.token);

    const first = await createColumn(owner.token, boardId, 'To Do');
    const second = await createColumn(owner.token, boardId, 'In Progress');
    const third = await createColumn(owner.token, boardId, 'Done');

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(third.position).toBe(2);
  });

  it('blocks column creation on a board the user cannot access', async () => {
    const owner = await registerUser('colowner2@example.com');
    const outsider = await registerUser('coloutsider2@example.com');
    const boardId = await createBoard(owner.token);

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/columns`)
      .set(authed(outsider.token))
      .send({ name: 'Sneaky Column' })
      .expect(403);
  });

  it('creates, updates, and deletes a task, keeping positions contiguous after delete', async () => {
    const owner = await registerUser('taskowner@example.com');
    const boardId = await createBoard(owner.token);
    const column = await createColumn(owner.token, boardId, 'To Do');

    const taskA = await request(app.getHttpServer())
      .post(`/columns/${column.id}/tasks`)
      .set(authed(owner.token))
      .send({ title: 'Task A' })
      .expect(201);
    const taskB = await request(app.getHttpServer())
      .post(`/columns/${column.id}/tasks`)
      .set(authed(owner.token))
      .send({ title: 'Task B' })
      .expect(201);
    const taskC = await request(app.getHttpServer())
      .post(`/columns/${column.id}/tasks`)
      .set(authed(owner.token))
      .send({ title: 'Task C' })
      .expect(201);

    expect([taskA.body.position, taskB.body.position, taskC.body.position]).toEqual([0, 1, 2]);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/tasks/${taskA.body.id}`)
      .set(authed(owner.token))
      .send({ title: 'Task A Updated' })
      .expect(200);
    expect(updateResponse.body.title).toBe('Task A Updated');

    await request(app.getHttpServer()).delete(`/tasks/${taskA.body.id}`).set(authed(owner.token)).expect(200);

    const remaining = await request(app.getHttpServer())
      .get(`/columns/${column.id}/tasks`)
      .set(authed(owner.token))
      .expect(200);

    const positions = remaining.body.map((t: { position: number }) => t.position).sort();
    expect(positions).toEqual([0, 1]);
  });

  it('blocks task access when the requester has no relationship to the owning board', async () => {
    const owner = await registerUser('taskowner2@example.com');
    const outsider = await registerUser('taskoutsider2@example.com');
    const boardId = await createBoard(owner.token);
    const column = await createColumn(owner.token, boardId, 'To Do');

    const task = await request(app.getHttpServer())
      .post(`/columns/${column.id}/tasks`)
      .set(authed(owner.token))
      .send({ title: 'Private Task' })
      .expect(201);

    await request(app.getHttpServer()).get(`/tasks/${task.body.id}`).set(authed(outsider.token)).expect(403);

    await request(app.getHttpServer())
      .patch(`/tasks/${task.body.id}`)
      .set(authed(outsider.token))
      .send({ title: 'Hijacked' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/tasks/${task.body.id}`)
      .set(authed(outsider.token))
      .expect(403);
  });

  it('rejects an empty task title', async () => {
    const owner = await registerUser('taskowner3@example.com');
    const boardId = await createBoard(owner.token);
    const column = await createColumn(owner.token, boardId, 'To Do');

    await request(app.getHttpServer())
      .post(`/columns/${column.id}/tasks`)
      .set(authed(owner.token))
      .send({ title: '' })
      .expect(400);
  });
});
