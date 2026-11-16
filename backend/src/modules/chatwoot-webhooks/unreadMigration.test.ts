import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { expect, it } from 'vitest'
import { portalChatUnreadMessages, portalUsers } from '../../db/schema.js'
import * as schema from '../../db/schema.js'
import { MIGRATIONS_FOLDER } from '../../db/migrate.js'
import { seedTestTenant } from '../../test/testTenants.js'
import { createWebhookSourceKey } from './sourceKey.js'

it('backfills existing unread rows with the exact current source key without dropping history', async () => {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  try {
    const journal = JSON.parse(
      await readFile(
        path.join(MIGRATIONS_FOLDER, 'meta/_journal.json'),
        'utf8',
      ),
    ) as { entries: Array<{ tag: string }> }
    for (const entry of journal.entries.filter(
      (entry) => !entry.tag.startsWith('0026_'),
    )) {
      await client.exec(
        await readFile(
          path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
          'utf8',
        ),
      )
    }
    const { id: tenantId } = await seedTestTenant(db)
    const [user] = await db
      .insert(portalUsers)
      .values({ tenantId, email: 'migration@example.test' })
      .returning()
    await client.query(
      'insert into portal_chat_unread_messages (tenant_id, portal_user_id, thread_id, chatwoot_message_id) values ($1, $2, $3, $4)',
      [tenantId, user!.id, 'private:me', 501],
    )
    await client.exec(
      await readFile(
        path.join(MIGRATIONS_FOLDER, '0026_webhook_unread_source_scope.sql'),
        'utf8',
      ),
    )
    const [unread] = await db.select().from(portalChatUnreadMessages)
    expect(unread).toMatchObject({
      tenantId,
      portalUserId: user!.id,
      chatwootMessageId: 501,
      sourceKey: createWebhookSourceKey({
        baseUrl: 'https://chatwoot.example.test',
        accountId: 1,
        inboxId: 1,
      }),
    })
  } finally {
    await client.close()
  }
}, 15_000)
