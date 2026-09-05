import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-utils';

interface RegisteredUser {
  token: string;
  id: string;
  email: string;
}

describe('Boards, sharing, and authorization (e2e)', () => {
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

  async function registerUser(email: string): Promise<RegisteredUser> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test User', email, password: 'Password123' })
      .expect(201);
    return { token: response.body.accessToken, id: response.body.user.id, email };
  }

  function authed(userToken: string) {
    return { Authorization: `Bearer ${userToken}` };
  }

  it('creates a board with the authenticated user as owner and rejects a client-supplied ownerId', async () => {
    const owner = await registerUser('owner@example.com');

    const response = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'My Board', description: 'desc', ownerId: 'some-other-id' })
      .expect(400); // ownerId is not whitelisted -> forbidNonWhitelisted rejects the request

    expect(response.body.message).toBeDefined();
  });

  it('creates a board that only the owner can see, update, and delete', async () => {
    const owner = await registerUser('owner2@example.com');

    const createResponse = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'Owner Board', description: 'desc' })
      .expect(201);

    expect(createResponse.body.owner.id).toBe(owner.id);
    const boardId = createResponse.body.id;

    const updateResponse = await request(app.getHttpServer())
      .patch(`/boards/${boardId}`)
      .set(authed(owner.token))
      .send({ name: 'Renamed Board' })
      .expect(200);
    expect(updateResponse.body.name).toBe('Renamed Board');

    await request(app.getHttpServer()).delete(`/boards/${boardId}`).set(authed(owner.token)).expect(200);

    await request(app.getHttpServer()).get(`/boards/${boardId}`).set(authed(owner.token)).expect(404);
  });

  it('lists only boards the user owns or is a member of', async () => {
    const owner = await registerUser('owner3@example.com');
    const stranger = await registerUser('stranger@example.com');

    await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'Private Board' })
      .expect(201);

    const ownerBoards = await request(app.getHttpServer())
      .get('/boards')
      .set(authed(owner.token))
      .expect(200);
    expect(ownerBoards.body).toHaveLength(1);

    const strangerBoards = await request(app.getHttpServer())
      .get('/boards')
      .set(authed(stranger.token))
      .expect(200);
    expect(strangerBoards.body).toHaveLength(0);
  });

  it('blocks a user with no relationship to a board (owner of a different board) from accessing it', async () => {
    const userA = await registerUser('usera@example.com');
    const userB = await registerUser('userb@example.com');

    const boardAResponse = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(userA.token))
      .send({ name: 'Board A' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/boards')
      .set(authed(userB.token))
      .send({ name: 'Board B' })
      .expect(201);

    // User B (owner of Board B) must not be able to read, update, or delete Board A.
    await request(app.getHttpServer())
      .get(`/boards/${boardAResponse.body.id}`)
      .set(authed(userB.token))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/boards/${boardAResponse.body.id}`)
      .set(authed(userB.token))
      .send({ name: 'Hijacked' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/boards/${boardAResponse.body.id}`)
      .set(authed(userB.token))
      .expect(403);
  });

  it('rejects unauthenticated requests to board endpoints', async () => {
    await request(app.getHttpServer()).get('/boards').expect(401);
    await request(app.getHttpServer()).post('/boards').send({ name: 'x' }).expect(401);
  });

  it('lets the owner share a board with a registered user, and the member gains access', async () => {
    const owner = await registerUser('shareowner@example.com');
    const member = await registerUser('sharemember@example.com');

    const boardResponse = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'Shared Board' })
      .expect(201);
    const boardId = boardResponse.body.id;

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set(authed(owner.token))
      .send({ email: member.email })
      .expect(201);

    const memberView = await request(app.getHttpServer())
      .get(`/boards/${boardId}`)
      .set(authed(member.token))
      .expect(200);
    expect(memberView.body.id).toBe(boardId);
  });

  it('rejects adding a member who is not registered', async () => {
    const owner = await registerUser('ownerx@example.com');
    const boardResponse = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'Board' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/boards/${boardResponse.body.id}/members`)
      .set(authed(owner.token))
      .send({ email: 'ghost@example.com' })
      .expect(404);
  });

  it('rejects adding the same member twice and prevents a member from adding others', async () => {
    const owner = await registerUser('ownery@example.com');
    const member = await registerUser('membery@example.com');
    const boardResponse = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'Board' })
      .expect(201);
    const boardId = boardResponse.body.id;

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set(authed(owner.token))
      .send({ email: member.email })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set(authed(owner.token))
      .send({ email: member.email })
      .expect(409);

    const outsider = await registerUser('outsidery@example.com');
    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set(authed(member.token))
      .send({ email: outsider.email })
      .expect(403);
  });

  it('prevents removing the board owner and lets the owner remove a member', async () => {
    const owner = await registerUser('ownerz@example.com');
    const member = await registerUser('memberz@example.com');
    const boardResponse = await request(app.getHttpServer())
      .post('/boards')
      .set(authed(owner.token))
      .send({ name: 'Board' })
      .expect(201);
    const boardId = boardResponse.body.id;

    await request(app.getHttpServer())
      .post(`/boards/${boardId}/members`)
      .set(authed(owner.token))
      .send({ email: member.email })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/boards/${boardId}/members/${owner.id}`)
      .set(authed(owner.token))
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/boards/${boardId}/members/${member.id}`)
      .set(authed(owner.token))
      .expect(200);

    await request(app.getHttpServer()).get(`/boards/${boardId}`).set(authed(member.token)).expect(403);
  });
});
