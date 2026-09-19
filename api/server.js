/* opengym-api — Personal Training Platform Backend
   Prisma + SQLite, Password Auth with bcrypt, Session Cookies, RBAC */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const PORT = +(process.env.PORT || 3000);
const DATA = process.env.DATA_DIR || path.resolve(process.cwd(), '../data');
const ORIGIN = process.env.ORIGIN || 'http://localhost:8080';
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 90) || 90);
const MAX_BODY = 5 * 1024 * 1024;
const SECURE = /^https:/i.test(ORIGIN) ? ' Secure;' : '';

fs.mkdirSync(DATA, { recursive: true });

/* ---------- Secret & Prisma ---------- */
const secretFile = path.join(DATA, 'secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || `file:${path.join(DATA, 'gym.db').replace(/\\/g, '/')}`
    }
  }
});

/* ---------- Session Cookies & Crypto ---------- */
function signSession(uid) {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  const payload = `${uid}.${exp}`;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${hmac}`;
}

function verifySession(cookieStr) {
  if (!cookieStr) return null;
  const match = cookieStr.match(/(?:^|;\s*)gym_session=([a-zA-Z0-9_.-]+)/);
  if (!match) return null;
  const val = match[1];
  const parts = val.split('.');
  if (parts.length !== 3) return null;
  const [uid, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || exp < Date.now()) return null;
  const payload = `${uid}.${expStr}`;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return uid;
  }
  return null;
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  rc && rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

/* ---------- Request Helpers ---------- */
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('Body too large')); return; }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...headers
  });
  res.end(json);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

/* ---------- Auth Middleware ---------- */
async function authenticate(req) {
  const uid = verifySession(req.headers.cookie);
  if (!uid) return null;
  return await prisma.user.findUnique({ where: { id: uid } });
}

/* ---------- HTTP Server Routing ---------- */
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    /* ==========================================================================
       1. AUTHENTICATION & SESSION ENDPOINTS
       ========================================================================== */

    // GET /api/config
    if (req.method === 'GET' && pathname === '/api/config') {
      sendJson(res, 200, { invite_only: false });
      return;
    }

    // POST /api/auth/login or POST /api/login
    if (req.method === 'POST' && (pathname === '/api/auth/login' || pathname === '/api/login')) {
      const body = await readBody(req);
      const identifier = (body.username || body.identifier || body.email || '').trim().toLowerCase();
      const password = body.password || '';
      const expectedRole = body.expectedRole || null;

      if (!identifier || !password) {
        sendError(res, 400, 'Usuario y contraseña son requeridos');
        return;
      }

      // Buscar usuario por username o email
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: identifier },
            { email: identifier }
          ]
        }
      });

      if (!user || !user.passwordHash) {
        sendError(res, 401, 'Credenciales incorrectas');
        return;
      }

      const match = bcrypt.compareSync(password, user.passwordHash);
      if (!match) {
        sendError(res, 401, 'Credenciales incorrectas');
        return;
      }

      // Validar rol esperado
      if (expectedRole && user.role !== expectedRole) {
        sendError(res, 403, `Acceso no autorizado para el rol ${expectedRole}`);
        return;
      }

      // Validar estado de la cuenta
      if (user.status === 'paused' || user.status === 'archived') {
        sendError(res, 403, 'Tu cuenta está inactiva o pausada. Contacta a tu entrenador.');
        return;
      }

      const sessionCookie = signSession(user.id);
      const cookieHeader = `gym_session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400};${SECURE}`;

      sendJson(res, 200, {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      }, { 'Set-Cookie': cookieHeader });
      return;
    }

    // POST /api/auth/client-activate or POST /api/client/activate
    if (req.method === 'POST' && (pathname === '/api/auth/client-activate' || pathname === '/api/client/activate')) {
      const body = await readBody(req);
      const code = (body.code || '').trim().toUpperCase();
      const rawUsername = (body.username || '').trim().toLowerCase();
      const password = body.password || '';
      const email = (body.email || '').trim().toLowerCase() || null;

      if (!code || !password) {
        sendError(res, 400, 'Código y contraseña son requeridos');
        return;
      }
      if (password.length < 6) {
        sendError(res, 400, 'La contraseña debe tener al menos 6 caracteres');
        return;
      }

      const act = await prisma.activationCode.findFirst({
        where: { code, usedAt: null },
        include: { client: true }
      });

      if (!act || !act.client) {
        sendError(res, 404, 'Código de activación inválido o ya utilizado');
        return;
      }

      const clientId = act.clientId;
      const username = rawUsername || act.client.username || `client_${clientId.slice(0, 6)}`;
      const passwordHash = bcrypt.hashSync(password, 10);

      // Verificar si el username ya está tomado por otro usuario
      const existingUser = await prisma.user.findFirst({
        where: { username, NOT: { id: clientId } }
      });
      if (existingUser) {
        sendError(res, 400, 'El nombre de usuario ya está en uso. Elige otro.');
        return;
      }

      // Actualizar cliente
      const updatedUser = await prisma.user.update({
        where: { id: clientId },
        data: {
          username,
          email: email || act.client.email,
          passwordHash,
          status: 'active'
        }
      });

      // Quemar el código
      await prisma.activationCode.update({
        where: { id: act.id },
        data: { usedAt: new Date() }
      });

      const sessionCookie = signSession(updatedUser.id);
      const cookieHeader = `gym_session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400};${SECURE}`;

      sendJson(res, 200, {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          status: updatedUser.status
        }
      }, { 'Set-Cookie': cookieHeader });
      return;
    }

    // GET /api/me
    if (req.method === 'GET' && pathname === '/api/me') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }
      sendJson(res, 200, {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      });
      return;
    }

    // POST /api/auth/logout or POST /api/logout
    if (req.method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/logout' || pathname === '/api/logout/all')) {
      const clearCookie = `gym_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT;${SECURE}`;
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
      return;
    }

    /* ==========================================================================
       2. CLIENT SYNC & STATE ENDPOINTS
       ========================================================================== */

    // GET /api/data
    if (req.method === 'GET' && pathname === '/api/data') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }

      const st = await prisma.userState.findUnique({ where: { userId: user.id } });
      let state = {};
      if (st && st.data) {
        try { state = JSON.parse(st.data); } catch {}
      }
      sendJson(res, 200, { state });
      return;
    }

    // PUT /api/data
    if (req.method === 'PUT' && pathname === '/api/data') {
      const user = await authenticate(req);
      if (!user) {
        sendError(res, 401, 'No autenticado');
        return;
      }

      const body = await readBody(req);
      const stateObj = body.state || {};
      const stateStr = JSON.stringify(stateObj);

      await prisma.userState.upsert({
        where: { userId: user.id },
        update: { data: stateStr },
        create: { userId: user.id, data: stateStr }
      });

      sendJson(res, 200, { ok: true });
      return;
    }

    // GET /api/client/membership
    if (req.method === 'GET' && pathname === '/api/client/membership') {
      const user = await authenticate(req);
      if (!user || user.role !== 'client') {
        sendError(res, 403, 'Acceso denegado');
        return;
      }

      const packages = await prisma.package.findMany({
        where: { clientId: user.id },
        orderBy: { createdAt: 'desc' }
      });

      const activePackage = packages.find(p => p.status === 'active' && p.remainingClasses > 0) || packages[0] || null;
      const recentAttendances = await prisma.attendance.findMany({
        where: { clientId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      sendJson(res, 200, {
        activePackage,
        packages,
        recentAttendances
      });
      return;
    }

    /* ==========================================================================
       3. TRAINER MODULE ENDPOINTS (RBAC: Trainer Only)
       ========================================================================== */

    if (pathname.startsWith('/api/trainer/')) {
      const user = await authenticate(req);
      if (!user || user.role !== 'trainer') {
        sendError(res, 403, 'Acceso denegado: solo entrenadores autorizados');
        return;
      }
      const trainerId = user.id;

      // GET /api/trainer/clients
      if (req.method === 'GET' && pathname === '/api/trainer/clients') {
        const relations = await prisma.trainerClient.findMany({
          where: { trainerId },
          include: {
            client: {
              include: {
                packages: {
                  where: { status: 'active' },
                  orderBy: { createdAt: 'desc' },
                  take: 1
                },
                attendances: {
                  orderBy: { createdAt: 'desc' },
                  take: 1
                },
                activationCodes: {
                  where: { usedAt: null },
                  orderBy: { createdAt: 'desc' },
                  take: 1
                }
              }
            }
          },
          orderBy: { assignedAt: 'desc' }
        });

        const clients = relations.map(r => {
          const c = r.client;
          const activePkg = c.packages[0] || null;
          const lastAtt = c.attendances[0] || null;
          const activeCode = c.activationCodes[0] || null;

          return {
            id: r.id,
            clientId: c.id,
            name: c.name,
            username: c.username,
            email: c.email,
            phone: c.phone,
            status: c.status,
            assignedAt: r.assignedAt,
            hasPassword: !!c.passwordHash,
            activationCode: activeCode ? activeCode.code : null,
            activePackage: activePkg ? {
              id: activePkg.id,
              name: activePkg.name,
              totalClasses: activePkg.totalClasses,
              remainingClasses: activePkg.remainingClasses,
              expiresAt: activePkg.expiresAt,
              status: activePkg.status
            } : null,
            lastAttendance: lastAtt ? lastAtt.date : null
          };
        });

        sendJson(res, 200, { clients });
        return;
      }

      // POST /api/trainer/clients
      if (req.method === 'POST' && pathname === '/api/trainer/clients') {
        const body = await readBody(req);
        const name = (body.name || '').trim();
        const email = (body.email || '').trim().toLowerCase() || null;
        const phone = (body.phone || '').trim() || null;
        const notes = (body.notes || '').trim() || null;

        if (!name) {
          sendError(res, 400, 'El nombre del cliente es requerido');
          return;
        }

        const clientId = crypto.randomBytes(12).toString('base64url');
        const usernameBase = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') || 'cliente';
        let username = `${usernameBase}_${crypto.randomBytes(2).toString('hex')}`;

        // Crear cliente
        const newClient = await prisma.user.create({
          data: {
            id: clientId,
            username,
            name,
            email,
            phone,
            notes,
            role: 'client',
            status: 'pending_activation'
          }
        });

        // Relación Trainer-Client
        const relationId = crypto.randomBytes(12).toString('base64url');
        await prisma.trainerClient.create({
          data: {
            id: relationId,
            trainerId,
            clientId,
            status: 'active'
          }
        });

        // Código de activación
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        await prisma.activationCode.create({
          data: {
            code,
            clientId,
            trainerId
          }
        });

        // Paquete inicial opcional si se envió totalClasses
        let pkg = null;
        if (body.totalClasses && +body.totalClasses > 0) {
          const pkgId = crypto.randomBytes(12).toString('base64url');
          pkg = await prisma.package.create({
            data: {
              id: pkgId,
              clientId,
              trainerId,
              name: body.packageName || `Paquete ${body.totalClasses} Clases`,
              totalClasses: +body.totalClasses,
              remainingClasses: +body.totalClasses,
              price: body.price ? +body.price : null,
              expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
            }
          });
        }

        // Estado inicial de rutinas
        const starterState = {
          routines: [{ id: 'r1', name: 'Rutina Inicial', emoji: 'dumbbell', ex: [] }],
          week: { '1': 'r1', '3': 'r1', '5': 'r1' },
          dayPlan: {},
          workouts: [],
          bodyweight: [],
          _ts: Date.now()
        };
        await prisma.userState.create({
          data: {
            userId: clientId,
            data: JSON.stringify(starterState)
          }
        });

        sendJson(res, 201, {
          client: {
            id: relationId,
            clientId,
            name,
            username,
            email,
            status: 'pending_activation',
            activationCode: code,
            activePackage: pkg
          }
        });
        return;
      }

      // GET /api/trainer/clients/:id
      const clientDetailMatch = pathname.match(/^\/api\/trainer\/clients\/([a-zA-Z0-9_-]+)$/);
      if (req.method === 'GET' && clientDetailMatch) {
        const targetClientId = clientDetailMatch[1];
        
        // Validar que el cliente pertenezca al entrenador
        const relation = await prisma.trainerClient.findFirst({
          where: { trainerId, clientId: targetClientId },
          include: { client: true }
        });

        if (!relation || !relation.client) {
          sendError(res, 404, 'Cliente no encontrado o no asignado');
          return;
        }

        const client = relation.client;
        const packages = await prisma.package.findMany({
          where: { clientId: targetClientId },
          orderBy: { createdAt: 'desc' }
        });
        const attendances = await prisma.attendance.findMany({
          where: { clientId: targetClientId },
          orderBy: { createdAt: 'desc' },
          take: 50
        });
        const activationCode = await prisma.activationCode.findFirst({
          where: { clientId: targetClientId, usedAt: null },
          orderBy: { createdAt: 'desc' }
        });
        const userState = await prisma.userState.findUnique({
          where: { userId: targetClientId }
        });

        let parsedState = {};
        if (userState && userState.data) {
          try { parsedState = JSON.parse(userState.data); } catch {}
        }

        sendJson(res, 200, {
          client: {
            id: client.id,
            name: client.name,
            username: client.username,
            email: client.email,
            phone: client.phone,
            notes: client.notes,
            status: client.status,
            activationCode: activationCode ? activationCode.code : null,
            assignedAt: relation.assignedAt
          },
          packages,
          attendances,
          state: parsedState
        });
        return;
      }

      // PUT /api/trainer/clients/:id
      if (req.method === 'PUT' && clientDetailMatch) {
        const targetClientId = clientDetailMatch[1];
        const body = await readBody(req);

        const relation = await prisma.trainerClient.findFirst({
          where: { trainerId, clientId: targetClientId }
        });
        if (!relation) {
          sendError(res, 404, 'Cliente no encontrado');
          return;
        }

        const updated = await prisma.user.update({
          where: { id: targetClientId },
          data: {
            name: body.name !== undefined ? body.name : undefined,
            email: body.email !== undefined ? body.email : undefined,
            phone: body.phone !== undefined ? body.phone : undefined,
            notes: body.notes !== undefined ? body.notes : undefined,
            status: body.status !== undefined ? body.status : undefined
          }
        });

        sendJson(res, 200, { client: updated });
        return;
      }

      // POST /api/trainer/clients/:id/code or /api/trainer/clients/code
      if (req.method === 'POST' && (pathname === '/api/trainer/clients/code' || pathname.endsWith('/code'))) {
        const body = await readBody(req);
        let targetClientId = body.clientId;
        if (!targetClientId && clientDetailMatch) targetClientId = clientDetailMatch[1];

        if (!targetClientId) {
          sendError(res, 400, 'clientId es requerido');
          return;
        }

        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        await prisma.activationCode.create({
          data: {
            code,
            clientId: targetClientId,
            trainerId
          }
        });

        sendJson(res, 200, { code });
        return;
      }

      // GET /api/trainer/packages
      if (req.method === 'GET' && pathname === '/api/trainer/packages') {
        const targetClientId = url.searchParams.get('clientId');
        const where = { trainerId };
        if (targetClientId) where.clientId = targetClientId;

        const packages = await prisma.package.findMany({
          where,
          orderBy: { createdAt: 'desc' }
        });

        const activePackage = packages.find(p => p.status === 'active' && p.remainingClasses > 0) || null;
        sendJson(res, 200, { packages, activePackage });
        return;
      }

      // POST /api/trainer/packages
      if (req.method === 'POST' && pathname === '/api/trainer/packages') {
        const body = await readBody(req);
        const targetClientId = body.clientId;
        const totalClasses = +(body.totalClasses || 10);
        const name = body.name || `Paquete ${totalClasses} Clases`;
        const price = body.price ? +body.price : null;
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

        if (!targetClientId) {
          sendError(res, 400, 'clientId es requerido');
          return;
        }

        const pkgId = crypto.randomBytes(12).toString('base64url');
        const pkg = await prisma.package.create({
          data: {
            id: pkgId,
            clientId: targetClientId,
            trainerId,
            name,
            totalClasses,
            remainingClasses: totalClasses,
            price,
            expiresAt,
            status: 'active'
          }
        });

        sendJson(res, 201, { package: pkg });
        return;
      }

      // POST /api/trainer/attendance/checkin
      if (req.method === 'POST' && pathname === '/api/trainer/attendance/checkin') {
        const body = await readBody(req);
        const targetClientId = body.clientId;
        const today = body.date || new Date().toISOString().slice(0, 10);

        if (!targetClientId) {
          sendError(res, 400, 'clientId es requerido');
          return;
        }

        // Buscar paquete activo con clases restantes
        const activePkg = await prisma.package.findFirst({
          where: {
            clientId: targetClientId,
            status: 'active',
            remainingClasses: { gt: 0 }
          },
          orderBy: { createdAt: 'desc' }
        });

        if (!activePkg) {
          sendError(res, 400, 'El cliente no cuenta con un paquete activo con clases disponibles');
          return;
        }

        // Verificar si ya se registró asistencia hoy para advertir o procesar
        const existingToday = await prisma.attendance.findFirst({
          where: {
            clientId: targetClientId,
            date: today
          }
        });

        if (existingToday && !body.force) {
          sendJson(res, 200, {
            alreadyProcessed: true,
            message: 'Ya se registró asistencia hoy para este cliente',
            remainingClasses: activePkg.remainingClasses
          });
          return;
        }

        // Descontar clase y registrar asistencia en una transacción
        const newRemaining = Math.max(0, activePkg.remainingClasses - 1);
        const newStatus = newRemaining === 0 ? 'completed' : 'active';

        const [attendance] = await prisma.$transaction([
          prisma.attendance.create({
            data: {
              id: crypto.randomBytes(12).toString('base64url'),
              packageId: activePkg.id,
              clientId: targetClientId,
              trainerId,
              date: today,
              note: body.note || null
            }
          }),
          prisma.package.update({
            where: { id: activePkg.id },
            data: {
              remainingClasses: newRemaining,
              status: newStatus
            }
          })
        ]);

        sendJson(res, 200, {
          success: true,
          attendance,
          remainingClasses: newRemaining,
          packageStatus: newStatus
        });
        return;
      }

      // POST /api/trainer/client/plan
      if (req.method === 'POST' && pathname === '/api/trainer/client/plan') {
        const body = await readBody(req);
        const targetClientId = body.clientId;
        const week = body.week || {};
        const routines = body.routines || [];

        if (!targetClientId) {
          sendError(res, 400, 'clientId es requerido');
          return;
        }

        // Obtener estado actual del cliente
        const stRecord = await prisma.userState.findUnique({ where: { userId: targetClientId } });
        let st = { routines: [], week: {}, dayPlan: {}, workouts: [], bodyweight: [] };
        if (stRecord && stRecord.data) {
          try { st = JSON.parse(stRecord.data); } catch {}
        }

        if (routines.length > 0) st.routines = routines;
        if (week) st.week = week;
        st._ts = Date.now();

        await prisma.userState.upsert({
          where: { userId: targetClientId },
          update: { data: JSON.stringify(st) },
          create: { userId: targetClientId, data: JSON.stringify(st) }
        });

        sendJson(res, 200, { success: true, state: st });
        return;
      }
    }

    // 404
    sendError(res, 404, 'Endpoint no encontrado');
  } catch (err) {
    console.error('API Error:', err);
    sendError(res, 500, err.message || 'Error interno del servidor');
  }
});

server.listen(PORT, () => {
  console.log(`✓ Gym Platform API escuchando en puerto ${PORT}`);
});
