import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), '../data');

async function migrate() {
  console.log('🚀 Iniciando migración no destructiva de JSON a SQLite...');
  console.log('📂 Directorio de datos:', DATA_DIR);

  const dbJsonPath = path.join(DATA_DIR, 'db.json');
  if (!fs.existsSync(dbJsonPath)) {
    console.error('❌ No se encontró el archivo db.json en', dbJsonPath);
    process.exit(1);
  }

  const rawDb = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));

  // 1. Migrar Usuarios
  console.log('\n--- 1. Migrando Usuarios ---');
  for (const u of (rawDb.users || [])) {
    let username = (u.username || u.name.toLowerCase().replace(/\s+/g, '')).replace(/[^a-zA-Z0-9_-]/g, '');
    let role = u.role === 'trainer' ? 'trainer' : 'client';
    let status = u.role === 'trainer' ? 'active' : 'pending_activation';
    
    // Contraseña inicial para entrenador: Arvids2026!
    let passwordHash = null;
    if (role === 'trainer') {
      passwordHash = bcrypt.hashSync('Arvids2026!', 10);
    }

    const existing = await prisma.user.findUnique({ where: { id: u.id } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: u.id,
          username,
          name: u.name,
          role,
          status,
          passwordHash,
          createdAt: u.created ? new Date(u.created) : new Date()
        }
      });
      console.log(`✓ Usuario creado: ${u.name} (id: ${u.id}, username: ${username}, role: ${role})`);
    } else {
      console.log(`ℹ Usuario ya existe: ${u.name} (id: ${u.id})`);
    }
  }

  // 2. Migrar Relaciones Trainer-Client
  console.log('\n--- 2. Migrando Relaciones Trainer-Client ---');
  for (const tc of (rawDb.trainer_clients || [])) {
    const existing = await prisma.trainerClient.findUnique({ where: { id: tc.id } });
    if (!existing) {
      await prisma.trainerClient.create({
        data: {
          id: tc.id,
          trainerId: tc.trainerId,
          clientId: tc.clientId,
          status: tc.status || 'active',
          assignedAt: tc.assignedAt ? new Date(tc.assignedAt) : new Date()
        }
      });
      console.log(`✓ Relación creada: Trainer ${tc.trainerId} -> Client ${tc.clientId}`);
    }
  }

  // 3. Migrar Paquetes
  console.log('\n--- 3. Migrando Paquetes ---');
  for (const pkg of (rawDb.packages || [])) {
    const existing = await prisma.package.findUnique({ where: { id: pkg.id } });
    if (!existing) {
      await prisma.package.create({
        data: {
          id: pkg.id,
          clientId: pkg.clientId,
          trainerId: pkg.trainerId,
          name: pkg.name,
          totalClasses: pkg.totalClasses,
          remainingClasses: pkg.remainingClasses,
          price: pkg.price || null,
          status: pkg.status || 'active',
          expiresAt: pkg.expiresAt ? new Date(pkg.expiresAt) : null,
          createdAt: pkg.createdAt ? new Date(pkg.createdAt) : new Date()
        }
      });
      console.log(`✓ Paquete creado: ${pkg.name} (${pkg.remainingClasses}/${pkg.totalClasses} restantes)`);
    }
  }

  // 4. Migrar Asistencias
  console.log('\n--- 4. Migrando Asistencias ---');
  for (const att of (rawDb.attendances || [])) {
    const existing = await prisma.attendance.findUnique({ where: { id: att.id } });
    if (!existing) {
      await prisma.attendance.create({
        data: {
          id: att.id,
          packageId: att.packageId || null,
          clientId: att.clientId,
          trainerId: att.trainerId,
          date: att.date,
          workoutId: att.workoutId || null,
          note: att.note || null,
          createdAt: att.createdAt ? new Date(att.createdAt) : new Date()
        }
      });
      console.log(`✓ Asistencia creada: Fecha ${att.date} para Cliente ${att.clientId}`);
    }
  }

  // 5. Migrar Códigos de Activación
  console.log('\n--- 5. Migrando Códigos de Activación ---');
  for (const ac of (rawDb.activation_codes || [])) {
    const existing = await prisma.activationCode.findUnique({ where: { code: ac.code } });
    if (!existing) {
      await prisma.activationCode.create({
        data: {
          code: ac.code,
          clientId: ac.clientId,
          trainerId: ac.trainerId,
          createdAt: ac.createdAt ? new Date(ac.createdAt) : new Date()
        }
      });
      console.log(`✓ Código de activación registrado: ${ac.code} para Cliente ${ac.clientId}`);
    }
  }

  // 6. Migrar Estados de Usuario (state-<uid>.json)
  console.log('\n--- 6. Migrando Estados de Usuario y Rutinas ---');
  const files = fs.readdirSync(DATA_DIR);
  for (const file of files) {
    if (file.startsWith('state-') && file.endsWith('.json')) {
      const uid = file.slice(6, -5);
      const stateContent = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
      const stateObj = JSON.parse(stateContent);

      // Guardar UserState
      await prisma.userState.upsert({
        where: { userId: uid },
        update: { data: stateContent },
        create: { userId: uid, data: stateContent }
      });
      console.log(`✓ UserState migrado para ${uid}`);

      // Migrar rutinas estructuradas
      if (Array.isArray(stateObj.routines)) {
        for (const r of stateObj.routines) {
          const rExists = await prisma.routine.findUnique({ where: { id: r.id } });
          if (!rExists) {
            await prisma.routine.create({
              data: {
                id: r.id,
                name: r.name || 'Rutina',
                emoji: r.emoji || 'dumbbell',
                clientId: uid,
                isTemplate: false
              }
            });
            console.log(`  ✓ Rutina migrada: ${r.name} (${r.id})`);
          }
        }
      }

      // Migrar Plan Semanal
      if (stateObj.week && typeof stateObj.week === 'object') {
        const wp = {
          clientId: uid,
          monday: stateObj.week['1'] || null,
          tuesday: stateObj.week['2'] || null,
          wednesday: stateObj.week['3'] || null,
          thursday: stateObj.week['4'] || null,
          friday: stateObj.week['5'] || null,
          saturday: stateObj.week['6'] || null,
          sunday: stateObj.week['0'] || null
        };
        await prisma.weeklyPlan.upsert({
          where: { clientId: uid },
          update: wp,
          create: wp
        });
        console.log(`  ✓ Plan Semanal migrado para cliente ${uid}`);
      }
    }
  }

  // 7. Validación Integral
  console.log('\n========================================');
  console.log('📊 REPORTE DE VALIDACIÓN POST-MIGRACIÓN:');
  console.log('========================================');

  const usersCount = await prisma.user.count();
  const tcCount = await prisma.trainerClient.count();
  const pkgCount = await prisma.package.count();
  const attCount = await prisma.attendance.count();
  const acCount = await prisma.activationCode.count();
  const routineCount = await prisma.routine.count();
  const wpCount = await prisma.weeklyPlan.count();

  console.log(`- Usuarios: ${usersCount}`);
  console.log(`- Relaciones Entrenador/Cliente: ${tcCount}`);
  console.log(`- Paquetes: ${pkgCount}`);
  console.log(`- Asistencias: ${attCount}`);
  console.log(`- Códigos de activación: ${acCount}`);
  console.log(`- Rutinas: ${routineCount}`);
  console.log(`- Planes Semanales: ${wpCount}`);

  const arvids = await prisma.user.findUnique({ where: { id: 'piYdx5GveQarq8u9' } });
  const carlos = await prisma.user.findUnique({ where: { id: '4TeQTO1E7QFxdd0N' }, include: { packages: true, attendances: true } });

  console.log('\n--- Verificación de Datos Clave ---');
  console.log(`Entrenador Arvids: ${arvids ? 'PRESENTE (' + arvids.username + ', rol: ' + arvids.role + ')' : 'FALTANTE'}`);
  console.log(`Cliente Carlos: ${carlos ? 'PRESENTE (' + carlos.name + ', rol: ' + carlos.role + ')' : 'FALTANTE'}`);
  if (carlos && carlos.packages.length > 0) {
    console.log(`Paquete Carlos: ${carlos.packages[0].name} (${carlos.packages[0].remainingClasses}/${carlos.packages[0].totalClasses} clases restantes)`);
  }
  if (carlos && carlos.attendances.length > 0) {
    console.log(`Asistencia Carlos: Fecha ${carlos.attendances[0].date}`);
  }
  console.log('\n✅ MIGRACIÓN COMPLETADA SIN ERRORES');
}

migrate()
  .catch(err => {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
