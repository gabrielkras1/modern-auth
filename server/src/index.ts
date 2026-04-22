import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const rpID = 'localhost';
const origin = 'http://localhost:5173';
const JWT_SECRET = 'SECRET_DO_PROFESSOR_COBROU';

// ⚠️ Em produção usar Redis/Session
(global as any).currentChallenge = '';
(global as any).currentUserId = '';

/* ======================================================
   REGISTRO
====================================================== */

app.get('/register/options', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email obrigatório' });
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({ data: { email } });
    }

    const options = await generateRegistrationOptions({
      rpName: 'Projeto FIDO2 Gabriel',
      rpID,
      userID: Buffer.from(user.id),
      userName: user.email,
      userDisplayName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    (global as any).currentChallenge = options.challenge;
    (global as any).currentUserId = user.id;

    console.log('✅ Challenge registro:', options.challenge);

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/register/verify', async (req, res) => {
  try {
    const { body } = req;

    const expectedChallenge = (global as any).currentChallenge;
    const userId = (global as any).currentUserId;

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Falha no registro' });
    }

const regInfo = verification.registrationInfo;

await prisma.authenticator.create({
  data: {
    credentialID: Buffer.from(regInfo.credentialID),
    credentialPublicKey: Buffer.from(regInfo.credentialPublicKey),
    counter: BigInt(regInfo.counter),
    credentialDeviceType: regInfo.credentialDeviceType,
    credentialBackedUp: regInfo.credentialBackedUp,
    userId,
  },
});

    console.log('✅ Passkey registrada');

    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Registro erro:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ======================================================
   LOGIN
====================================================== */

app.get('/login/options', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email obrigatório' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { authenticators: true },
    });

    if (!user || user.authenticators.length === 0) {
      return res.status(404).json({ error: 'Sem biometria' });
    }

    const options = await generateAuthenticationOptions({
      rpID,
allowCredentials: [
  {
    id: user.authenticators[0].credentialID.toString('base64url'),
    type: 'public-key',
    transports: ['internal'],
  },
],
      userVerification: 'preferred',
    });

    (global as any).currentChallenge = options.challenge;
    (global as any).currentUserId = user.id;

    console.log('✅ Challenge login:', options.challenge);

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/login/verify', async (req, res) => {
  try {
    const { body } = req;

    const expectedChallenge = (global as any).currentChallenge;
    const userId = (global as any).currentUserId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { authenticators: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // 🔥 ESSA LINHA É CRÍTICA
    const auth = user.authenticators.find(
      (a) => a.credentialID.toString('base64url') === body.rawId
    );

 console.log('👉 IDs banco:', user.authenticators.map(a => a.credentialID.toString('base64url')));
console.log('👉 body.id:', body.id);
console.log('👉 body.rawId:', body.rawId);

    if (!auth) {
      console.error('❌ Authenticator não encontrado');
      return res.status(404).json({ error: 'Dispositivo não reconhecido' });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: auth.credentialID,
        credentialPublicKey: auth.credentialPublicKey,
        counter: Number(auth.counter),
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    await prisma.authenticator.updateMany({
      where: { credentialID: auth.credentialID },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ success: true, token });
  } catch (error: any) {
    console.error('❌ LOGIN ERRO:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ======================================================
   MAGIC LINK
====================================================== */

app.post('/auth/magic-link', async (req, res) => {
  const { email } = req.body;

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await prisma.user.update({
    where: { id: user.id },
    data: { otp },
  });

  console.log(`📧 Código para ${email}: ${otp}`);

  res.json({ success: true });
});

app.post('/auth/magic-link/verify', async (req, res) => {
  const { email, code } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.otp !== code) {
    return res.status(401).json({ error: 'Código inválido' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otp: null },
  });

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({ success: true, token });
});

app.listen(3001, () => {
  console.log('🚀 Servidor rodando em http://localhost:3001');
});