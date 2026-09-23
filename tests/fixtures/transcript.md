**You:** I want a tiny RSS reader in Node.

**Claude:** Great, we'll use Prisma and SQLite for storage. Let's go with node-cron for the scheduler.

**You:** It must de-duplicate feeds and should tag items.

**Claude:** Here is the schema:

```prisma
model Item {
  id   Int    @id @default(autoincrement())
  feed String
}
```

Next step: add the de-duplication check before inserting.

**You:** how do I test this?