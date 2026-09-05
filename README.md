# Mini Kanban Board — Backend

A production-quality REST API for a collaborative Kanban board, built with **NestJS**, **TypeScript**, **PostgreSQL**, and **Prisma**. Users can register, create boards, share them with other registered users, and manage columns and tasks — including moving tasks within and across columns with stable, gap-free ordering.

All authorization is enforced **server-side**. No endpoint trusts a client-supplied `ownerId`, `userId`, or `boardId` for access control — every check is resolved from the database.

## Tech stack

- NestJS + TypeScript (strict mode)
- PostgreSQL + Prisma ORM
- JWT authentication (`@nestjs/jwt`, `passport-jwt`)
- `bcrypt` password hashing
- `class-validator` / `class-transformer` for DTO validation
- Swagger / OpenAPI (`@nestjs/swagger`)
- Jest + Supertest for unit and e2e tests
- Docker & Docker Compose

## Project structure

```
backend/
├── src/
│   ├── auth/            # register, login, /auth/me, JWT strategy & guard
│   ├── users/            # shared user lookups, safe response mapping
│   ├── boards/            # board CRUD + BoardAccessService (authorization helper)
│   ├── board-members/    # board sharing (add/list/remove members)
│   ├── columns/          # column CRUD, auto position assignment
│   ├── tasks/             # task CRUD + the task-move algorithm
│   ├── prisma/            # PrismaService / PrismaModule
│   ├── common/            # guards, decorators, exception filter, shared types
│   ├── app.module.ts
│   └── main.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── test/                  # e2e tests (supertest against a real Postgres DB)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Data model

| Model         | Notes                                                                 |
|---------------|------------------------------------------------------------------------|
| `User`        | `email` unique, `passwordHash` never returned by the API              |
| `Board`       | one `ownerId`, cascades to columns/members on delete                   |
| `BoardMember` | `@@unique([boardId, userId])`, `role` is `OWNER` \| `MEMBER`           |
| `Column`      | belongs to a board, `position` is a contiguous zero-based integer      |
| `Task`        | belongs to a column, `position` is a contiguous zero-based integer     |

Indexes: `User.email`, `Board.ownerId`, `BoardMember.boardId`, `BoardMember.userId`, `Column(boardId, position)`, `Task(columnId, position)`.

## Getting started

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 14+ (or use the provided Docker Compose setup)

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# edit .env if your local Postgres credentials differ
```

### 4. Set up the database
```bash
npx prisma migrate dev      # creates the schema
npx prisma generate         # generates the Prisma Client (also runs automatically after install)
npm run prisma:seed         # optional: seeds sample users/boards/columns/tasks
```

### 5. Run the API
```bash
npm run start:dev
```

The API listens on `http://localhost:3000` by default. Interactive API docs are at:

```
http://localhost:3000/api/docs
```

## Running with Docker

```bash
docker compose up --build
```

This starts PostgreSQL and the API together. The API container runs `prisma migrate deploy` automatically on startup before booting the server.

## Seeded accounts

Running `npm run prisma:seed` creates:

| Email                        | Role                                   | Password      |
|-------------------------------|-----------------------------------------|---------------|
| `alice.owner@example.com`    | Owns both seeded boards                 | `Password123` |
| `bob.member@example.com`     | Member of "Product Roadmap"             | `Password123` |
| `carol.member@example.com`   | Member of "Product Roadmap"             | `Password123` |
| `dave.outsider@example.com`  | No access to any seeded board (for testing 403s) | `Password123` |

## API overview

All protected routes require `Authorization: Bearer <accessToken>`.

### Auth
| Method | Path             | Description                     |
|--------|------------------|----------------------------------|
| POST   | `/auth/register` | Create an account                |
| POST   | `/auth/login`    | Log in, receive a JWT            |
| GET    | `/auth/me`       | Get the current user (protected) |

### Boards
| Method | Path              | Description                                  |
|--------|-------------------|-----------------------------------------------|
| POST   | `/boards`          | Create a board (creator becomes OWNER)       |
| GET    | `/boards`          | List boards you own or are a member of       |
| GET    | `/boards/:boardId` | Get a board with its columns and tasks       |
| PATCH  | `/boards/:boardId` | Update a board (owner only)                  |
| DELETE | `/boards/:boardId` | Delete a board (owner only)                  |

### Board sharing
| Method | Path                                | Description                            |
|--------|--------------------------------------|------------------------------------------|
| POST   | `/boards/:boardId/members`           | Add a registered user by email (owner only) |
| GET    | `/boards/:boardId/members`           | List members of a board                |
| DELETE | `/boards/:boardId/members/:userId`   | Remove a member (owner only, cannot remove the owner) |

### Columns
| Method | Path                         | Description                              |
|--------|-------------------------------|--------------------------------------------|
| POST   | `/boards/:boardId/columns`    | Create a column (position auto-assigned)  |
| GET    | `/boards/:boardId/columns`    | List columns (with tasks) on a board      |
| PATCH  | `/columns/:columnId`          | Rename and/or reposition a column         |
| DELETE | `/columns/:columnId`          | Delete a column and its tasks             |

### Tasks
| Method | Path                          | Description                             |
|--------|--------------------------------|--------------------------------------------|
| POST   | `/columns/:columnId/tasks`    | Create a task (position auto-assigned)    |
| GET    | `/columns/:columnId/tasks`    | List tasks in a column                    |
| GET    | `/tasks/:taskId`               | Get a single task                         |
| PATCH  | `/tasks/:taskId`               | Update a task's title/description         |
| DELETE | `/tasks/:taskId`               | Delete a task                             |
| PATCH  | `/tasks/:taskId/move`          | Move a task within or across columns      |

**Move request body:**
```json
{
  "targetColumnId": "b3f1a2c4-9d3e-4b1a-8f2e-7a6c5d4e3f21",
  "position": 1
}
```

## Authorization model

`BoardAccessService` (`src/boards/board-access.service.ts`) is the single, reusable source of truth for access control:

- `assertAccess(boardId, userId)` — throws `404` if the board doesn't exist, `403` if the user is neither the owner nor a member.
- `assertOwner(boardId, userId)` — throws `403` unless the user owns the board. Used for board update/delete and member management.
- `assertColumnAccess(columnId, userId)` — resolves the column's board **from the database** (never trusts a client-supplied `boardId`) and delegates to `assertAccess`.
- `assertTaskAccess(taskId, userId)` — resolves the task's column and board from the database and delegates to `assertAccess`.

Every columns/tasks/move endpoint resolves ownership this way, so a user cannot access or mutate resources on a board they don't belong to, even if they know a valid UUID.

## Task ordering & the move algorithm

Positions are plain, contiguous, zero-based integers per column (`Task`) or per board (`Column`). `TasksService.move` (`src/tasks/tasks.service.ts`) implements the move inside a single `prisma.$transaction`:

1. Load the task and confirm the caller has access to its board (via `BoardAccessService`).
2. Load the target column and verify it belongs to the **same board** as the source column — cross-board moves are rejected with `403`.
3. Clamp the requested position into the valid range for the destination column (so an out-of-range position lands on the last valid slot instead of erroring).
4. **Same column:** shift the tasks strictly between the old and new position by ±1, then set the task's new position.
5. **Different column:** close the gap in the source column (`position > oldPosition → decrement`), open a slot in the target column (`position >= newPosition → increment`), then move the task (new `columnId` + `position`).

All updates happen atomically — if any step fails, the whole move rolls back and ordering is never left inconsistent.

Deleting a task/column also re-compacts the remaining positions inside a transaction so there are never any gaps.

## Validation & error handling

- A global `ValidationPipe` runs with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true` — unexpected fields (like a client-supplied `ownerId`) are rejected outright.
- `ParseUUIDPipe` validates all `:id` route params.
- A global `AllExceptionsFilter` normalizes every error into `{ statusCode, message, path, timestamp }` and maps common Prisma errors (`P2002` unique violation → `409`, `P2025` not found → `404`) without leaking internals.

## Testing

```bash
npm test              # unit tests (mocked Prisma, no DB required)
npm run test:e2e       # integration tests against a real Postgres database
```

The e2e suite (`test/*.e2e-spec.ts`) requires `DATABASE_URL` to point at a running, migrated Postgres database (it cleans relevant tables before each test). It covers:

- **Auth:** register, duplicate email, login, wrong password, protected route access
- **Authorization:** owner access, member access, unauthenticated requests, cross-board access blocked on boards/columns/tasks/move
- **Boards:** create (rejecting a client-supplied `ownerId`), list, update, delete
- **Sharing:** add/list/remove members, duplicate-member rejection, non-owner blocked from managing members, owner cannot be removed
- **Tasks:** create, update, delete, contiguous re-numbering after delete
- **Movement:** same-column (front/middle/last/position-0), cross-column, into an empty column, out-of-range position clamping, cross-board rejection

Unit tests (`src/**/*.spec.ts`) cover `BoardAccessService` and the `TasksService.move` algorithm in isolation with a mocked `PrismaService`.

## Environment variables

| Variable         | Description                                  |
|-------------------|------------------------------------------------|
| `DATABASE_URL`    | PostgreSQL connection string                  |
| `JWT_SECRET`      | Secret used to sign JWTs                       |
| `JWT_EXPIRES_IN`  | Token lifetime (e.g. `1d`, `12h`)              |
| `PORT`             | HTTP port (default `3000`)                     |

See `.env.example`.
