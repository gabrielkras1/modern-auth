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
import { isoBase64URL } from '@simplewebauthn/server/helpers';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const rpID = 'localhost';
const origin = 'http://localhost:5173';
const JWT_SECRET = 'SECRET_DO_PROFESSOR_COBROU';

// Armazena challenges temporários
const challengeSessions = new Map<string, { challenge: string; userId: string }>();

/* ======================================================
   REGISTRO (PASSKEY)
====================================================== */

app.get('/register/options', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email obrigatório' });
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { authenticators: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email },
        include: { authenticators: true },
      });
    }

    const options = await generateRegistrationOptions({
      rpName: 'Auth Gabriel v3',
      rpID,
      userID: new TextEncoder().encode(user.id), // ✅ CORRETO
      userName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'required',
      },
    });

    challengeSessions.set(user.id, {
      challenge: options.challenge,
      userId: user.id,
    });

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/register/verify', async (req, res) => {
  try {
    const { body, email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    const session = challengeSessions.get(user?.id || '');

    if (!session || !user) {
      return res.status(400).json({ error: 'Sessão expirada' });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: session.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const {
        credentialID,
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp,
      } = verification.registrationInfo;

      await prisma.authenticator.create({
        data: {
          credentialID: Buffer.from(credentialID),
          credentialPublicKey: Buffer.from(credentialPublicKey),
          counter: BigInt(counter),
          credentialDeviceType,
          credentialBackedUp,
          userId: user.id,
        },
      });

      challengeSessions.delete(user.id);

      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Falha na verificação' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/* ======================================================
   LOGIN (PASSKEY)
====================================================== */

app.get('/login/options', async (req, res) => {
  try {
    const { email } = req.query;

    const user = await prisma.user.findUnique({
      where: { email: email as string },
      include: { authenticators: true },
    });

    if (!user || user.authenticators.length === 0) {
      return res.status(404).json({
        error: 'Nenhuma Passkey encontrada para este email.',
      });
    }

    const options = await generateAuthenticationOptions({
      rpID,

      userVerification: 'required',
    });

    challengeSessions.set(user.id, {
      challenge: options.challenge,
      userId: user.id,
    });

    res.json(options);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/login/verify', async (req, res) => {
  try {
    const { body, email } = req.body;

const user = await prisma.user.findFirst({
  where: {
    authenticators: {
      some: {
        credentialID: Buffer.from(isoBase64URL.toBuffer(body.id)),
      },
    },
  },
  include: { authenticators: true },
});

    const session = challengeSessions.get(user?.id || '');

    if (!session || !user) {
      return res.status(400).json({ error: 'Sessão inválida' });
    }

    const authenticator = user.authenticators.find(
      (a) => isoBase64URL.fromBuffer(a.credentialID) === body.id
    );

    if (!authenticator) {
      return res.status(404).json({ error: 'Credencial não reconhecida' });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: session.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: isoBase64URL.fromBuffer(authenticator.credentialID),
        credentialPublicKey: new Uint8Array(authenticator.credentialPublicKey), // ✅ CORRETO
        counter: Number(authenticator.counter),
      },
    });

    if (verification.verified) {
      await prisma.authenticator.update({
        where: { credentialID: authenticator.credentialID },
        data: {
          counter: BigInt(verification.authenticationInfo.newCounter),
        },
      });

      challengeSessions.delete(user.id);

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      return res.json({ success: true, token });
    }

    return res.status(401).json({ error: 'Falha no login' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/* ======================================================
   MAGIC LINK (OTP)
====================================================== */

app.post('/auth/magic-link', async (req, res) => {
  try {
    const { email } = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.user.upsert({
      where: { email },
      update: { otp },
      create: { email, otp },
    });

    console.log(`📧 Código para ${email}: ${otp}`);

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao gerar OTP' });
  }
});

app.post('/auth/magic-link/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

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
  } catch {
    res.status(500).json({ error: 'Erro na verificação' });
  }
});

/* ======================================================
   SERVER
====================================================== */

app.listen(3001, () => {
  console.log('🚀 Server rodando em http://localhost:3001');
});