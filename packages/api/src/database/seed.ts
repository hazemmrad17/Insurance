/**
 * Database Seed script — populates initial demo data for Previa Platform
 */
import { db } from './client.js';
import { users, clients, properties } from './schema.js';
import { hashPassword } from '../services/auth.service.js';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Seeding database...');

  // 1. Seed demo user (Assureur)
  const email = 'demo@previa.fr';
  let user = await db.select().from(users).where(eq(users.email, email)).get();

  if (!user) {
    const passwordHash = await hashPassword('Previa2026!');
    [user] = await db.insert(users).values({
      email,
      passwordHash,
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'assureur',
    }).returning();
    console.log('✅ Created demo user:', email, '(Password: Previa2026!)');
  } else {
    console.log('ℹ️ Demo user already exists:', email);
  }

  // 2. Seed initial client
  const existingClients = await db.select().from(clients).where(eq(clients.userId, user.id));
  if (existingClients.length === 0) {
    const [client] = await db.insert(clients).values({
      userId: user.id,
      civility: 'M.',
      firstName: 'Alain',
      lastName: 'Prost',
      email: 'alain.prost@example.fr',
      phone: '06 12 34 56 78',
      insuredAddress: '8 Rue de la Paix',
      insuredPostalCode: '75002',
      insuredCity: 'Paris',
      status: 'active',
    }).returning();

    console.log('✅ Created initial client:', client.firstName, client.lastName);

    // 3. Seed initial property
    const [property] = await db.insert(properties).values({
      clientId: client.id,
      address: '8 Rue de la Paix, 75002 Paris',
      postalCode: '75002',
      city: 'Paris',
      dpeClass: 'C',
      builtYear: 1890,
      banId: '75102_6998_00008',
      longitude: 2.330992,
      latitude: 48.868831,
    }).returning();

    console.log('✅ Created initial property:', property.address);
  } else {
    console.log('ℹ️ Seed clients already exist');
  }

  console.log('🎉 Seeding completed!');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
