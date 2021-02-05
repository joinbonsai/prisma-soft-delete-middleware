# Soft delete middleware for NodeJS projects using the Prisma DB client

## Prerequisites

This middleware requires that all tables, including join tables, have both updatedAt and deletedAt columns. We enforce this using a DangerJS rule, and wrap all new code with tests to ensure that we never encounter a table that lacks these columns, as their absence will cause the Rust binary to tip over because the middleware is referencing columns that do not exist.

## Usage

We do the following in our dependency injection layer:

```
const prisma = new PrismaClient()
applyMiddleware(prisma)
```

## Shortcomings

Right now, nested relations that have been soft-deleted are not being filtered by this middleware. Imagine the following schema:

```
model User {
  id                  String          @id @default(uuid())
  posts               Post[]
}

model Post {
  id                  String          @id @default(uuid())
  userId              String          @unique
  user                User
}
```

And the following test scenario:

```
  it("should drop deleted records in many-to-many relationships", async () => {
    let user
    user = await prisma.user.create()
    await prisma.post.create({ data: { id: 1 }})
    await prisma.post.create({ data: { id: 2 }})

    user = await prisma.user.findUnique({ where: { id: user.id }, include: { posts: true }})
    expect(user.posts).toHaveLength(2) // this passes

    await prisma.post.delete({ where: { id: 2 }})
    user = await prisma.user.findUnique({ where: { id: user.id }, include: { posts: true }})
    expect(user.posts).toHaveLength(1) // this fails
  })
```
