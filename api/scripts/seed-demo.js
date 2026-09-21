import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_TRAINER_ID = 'demo-trainer-001';

try {
  const existing = await prisma.user.findUnique({
    where: { id: DEMO_TRAINER_ID }
  });

  if (existing) {
    console.log(`ℹ Entrenador demo ya existe: ${existing.username}`);
  } else {
    const passwordHash = bcrypt.hashSync('Demo2026!', 10);

    await prisma.user.create({
      data: {
        id: DEMO_TRAINER_ID,
        username: 'demo',
        email: 'demo@example.com',
        passwordHash,
        name: 'Entrenador Demo',
        role: 'trainer',
        status: 'active',
        forcePasswordChange: false
      }
    });

    console.log('✅ Entrenador demo creado: demo / Demo2026!');
  }
} finally {
  await prisma.$disconnect();
}