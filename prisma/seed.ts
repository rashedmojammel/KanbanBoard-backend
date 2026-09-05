import { PrismaClient, BoardRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = await bcrypt.hash('Password123', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'alice.owner@example.com' },
    update: {},
    create: { name: 'Alice Owner', email: 'alice.owner@example.com', passwordHash: password },
  });

  const memberOne = await prisma.user.upsert({
    where: { email: 'bob.member@example.com' },
    update: {},
    create: { name: 'Bob Member', email: 'bob.member@example.com', passwordHash: password },
  });

  const memberTwo = await prisma.user.upsert({
    where: { email: 'carol.member@example.com' },
    update: {},
    create: { name: 'Carol Member', email: 'carol.member@example.com', passwordHash: password },
  });

  const outsider = await prisma.user.upsert({
    where: { email: 'dave.outsider@example.com' },
    update: {},
    create: { name: 'Dave Outsider', email: 'dave.outsider@example.com', passwordHash: password },
  });

  const productBoard = await prisma.board.create({
    data: {
      name: 'Product Roadmap',
      description: 'Planning board for the next release',
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, role: BoardRole.OWNER },
          { userId: memberOne.id, role: BoardRole.MEMBER },
          { userId: memberTwo.id, role: BoardRole.MEMBER },
        ],
      },
      columns: {
        create: [
          {
            name: 'To Do',
            position: 0,
            tasks: {
              create: [
                { title: 'Define MVP scope', position: 0 },
                { title: 'Write user stories', position: 1 },
              ],
            },
          },
          {
            name: 'In Progress',
            position: 1,
            tasks: {
              create: [{ title: 'Design onboarding flow', position: 0 }],
            },
          },
          {
            name: 'Review',
            position: 2,
            tasks: {
              create: [],
            },
          },
          {
            name: 'Done',
            position: 3,
            tasks: {
              create: [{ title: 'Set up project repository', position: 0 }],
            },
          },
        ],
      },
    },
  });

  const personalBoard = await prisma.board.create({
    data: {
      name: 'Alice - Personal Tasks',
      description: 'Private board only Alice can see',
      ownerId: owner.id,
      members: {
        create: [{ userId: owner.id, role: BoardRole.OWNER }],
      },
      columns: {
        create: [
          {
            name: 'Backlog',
            position: 0,
            tasks: { create: [{ title: 'Renew domain name', position: 0 }] },
          },
          {
            name: 'Done',
            position: 1,
            tasks: { create: [] },
          },
        ],
      },
    },
  });

  console.log('Seed complete:');
  console.log({
    users: { owner: owner.email, memberOne: memberOne.email, memberTwo: memberTwo.email, outsider: outsider.email },
    boards: { productBoard: productBoard.id, personalBoard: personalBoard.id },
    password: 'Password123 (for all seeded users)',
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
