import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('research_sessions', {
  id:text('id').primaryKey(), receivedAt:text('received_at').notNull(),
  mode:text('mode').notNull(), payload:text('payload').notNull(),
  ticketHash:text('ticket_hash').notNull(), withdrawalHash:text('withdrawal_hash').notNull()
});
export const tickets=sqliteTable('upload_tickets',{
  hash:text('hash').primaryKey(),sessionId:text('session_id').notNull(),expires:integer('expires').notNull()
});
export const limits=sqliteTable('upload_limits',{
  key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()
});
