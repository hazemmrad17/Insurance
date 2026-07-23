/**
 * Database schema — Drizzle ORM (SQLite via libSQL)
 */
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

const uuid = () => randomUUID();
const now = () => new Date().toISOString();

/* ─────────────── Users ─────────────── */

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(uuid),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['assureur', 'assure'] }).notNull().default('assureur'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(now),
  updatedAt: text('updated_at').notNull().$defaultFn(now),
});

/* ─────────────── Clients ─────────────── */

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey().$defaultFn(uuid),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  civility: text('civility'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  insuredAddress: text('insured_address'),
  insuredPostalCode: text('insured_postal_code'),
  insuredCity: text('insured_city'),
  status: text('status', { enum: ['active', 'pending', 'suspended'] }).notNull().default('active'),
  createdAt: text('created_at').notNull().$defaultFn(now),
});

/* ─────────────── Properties ─────────────── */

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey().$defaultFn(uuid),
  clientId: text('client_id')
    .references(() => clients.id, { onDelete: 'cascade' })
    .notNull(),
  address: text('address').notNull(),
  postalCode: text('postal_code'),
  city: text('city'),
  dpeClass: text('dpe_class'),
  builtYear: integer('built_year'),
  banId: text('ban_id'),   // string — BAN IDs like "75102_6998_00008"
  longitude: real('longitude'),
  latitude: real('latitude'),
  createdAt: text('created_at').notNull().$defaultFn(now),
});

/* ─────────────── Assessments ─────────────── */

export const assessments = sqliteTable('assessments', {
  id: text('id').primaryKey().$defaultFn(uuid),
  propertyId: text('property_id').references(() => properties.id),
  userId: text('user_id').references(() => users.id),
  addressLabel: text('address_label').notNull(),
  longitude: real('longitude').notNull(),
  latitude: real('latitude').notNull(),
  // Raw API snapshots (JSON strings — immutable after creation)
  buildingData: text('building_data'),
  geographyData: text('geography_data'),
  risksData: text('risks_data'),
  climateData: text('climate_data'),
  valuationData: text('valuation_data'),
  metadataData: text('metadata_data'),
  // Individual peril scores — queryable/indexable columns
  inondationScore: integer('inondation_score'),
  rgaScore: integer('rga_score'),
  tempeteScore: integer('tempete_score'),
  incendieScore: integer('incendie_score'),
  seismeScore: integer('seisme_score'),
  globalScore: integer('global_score'),
  createdAt: text('created_at').notNull().$defaultFn(now),
});

/* ─────────────── Documents ─────────────── */

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey().$defaultFn(uuid),
  clientId: text('client_id')
    .references(() => clients.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['contrat', 'cni', 'rib', 'mandat', 'photo', 'facture', 'autre'],
  }).notNull(),
  url: text('url').notNull(),
  sizeBytes: integer('size_bytes'),
  status: text('status', { enum: ['complete', 'pending'] }).default('pending'),
  uploadedAt: text('uploaded_at').notNull().$defaultFn(now),
});

/* ─────────────── Inferred Types ─────────────── */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
