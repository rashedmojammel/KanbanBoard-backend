import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-utils';

describe('Auth (e2e)', () => {
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

  const credentials = { name: 'Jane Doe', email: 'jane@example.com', password: 'Password123' };

  it('registers a new user and returns an access token', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.email).toBe(credentials.email);
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('rejects registration with a duplicate email', async () => {
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

    const response = await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(409);

    expect(response.body.message).toMatch(/already exists/i);
  });

  it('rejects registration with an invalid payload', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'weak' })
      .expect(400);
  });

  it('logs in with correct credentials', async () => {
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects login with the wrong password', async () => {
    await request(app.getHttpServer()).post('/auth/register').send(credentials).expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: 'WrongPassword1' })
      .expect(401);
  });

  it('rejects login for a non-existent user', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123' })
      .expect(401);
  });

  it('blocks access to a protected route without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('allows access to a protected route with a valid token', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .expect(200);

    expect(response.body.email).toBe(credentials.email);
  });
});
