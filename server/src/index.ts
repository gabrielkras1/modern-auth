import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

const app = express();
app.use(cors());
app.use(express.json());

const rpID = 'localhost';
const origin = 'http://localhost:5173';
const JWT_SECRET = 'SECRET_DO_PROFESSOR_COBROU';

// --- BANCO DE DADOS EM MEMÓRIA (Simulando o Prisma para a apresentação) ---
let user = { id: 'user_01', email: 'gabriel@teste.com', otp: null as string | null };
let authenticators: any[] = [];
let currentChallenge = '';

// --- FASE 1: REGISTRO ---
app.get('/register/options', async (req, res) => {
  const options = await generateRegistrationOptions({
    rpName: 'Projeto FIDO2 Gabriel',
    rpID,
    userID: Buffer.from(user.id),
    userName: user.email,
    userDisplayName: 'Gabriel Kras',
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  currentChallenge = options.challenge;
  res.json(options);
});

// --- REGISTRO (VERIFY) ---
app.post('/register/verify', async (req, res) => {
  const { body } = req;
  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      
      // Limpa o array para garantir que só tenha UMA credencial (evita confusão no teste)
      authenticators = []; 

      authenticators.push({
        credentialID: Buffer.from(credential.id, 'base64url'),
        credentialPublicKey: Buffer.from(credential.publicKey),
        counter: credential.counter || 0, // Garante que nunca seja undefined
      });

      console.log("✅ Dispositivo cadastrado no servidor!");
      return res.json({ success: true });
    }
    res.status(400).json({ error: 'Falha na verificação' });
  } catch (error: any) {
    console.error("Erro no Registro:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- LOGIN (VERIFY) ---
app.post('/login/verify', async (req, res) => {
  const { body } = req;
  try {
    // 1. Localiza a credencial
    const auth = authenticators.find(a => 
      Buffer.from(a.credentialID).toString('base64url') === body.id
    );

    if (!auth) {
      return res.status(404).json({ error: "Dispositivo não encontrado. Cadastre de novo." });
    }

    // 2. Verifica a resposta do hardware
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: auth.credentialID,
        credentialPublicKey: auth.credentialPublicKey,
        counter: Number(auth.counter),
      },
    });

    // 3. Validação de sucesso
    if (verification.verified && verification.authenticationInfo) {
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
      
      // Atualiza o contador de segurança
      auth.counter = verification.authenticationInfo.newCounter;
      
      console.log("✅ Login OK! JWT Gerado.");
      return res.json({ success: true, token });
    }

    res.status(401).json({ error: 'Assinatura inválida' });
  } catch (error: any) {
    console.error("❌ ERRO NO LOGIN:", error.message);
    // Se o erro for desafio expirado, avisamos o usuário
    res.status(500).json({ error: "Erro na autenticação: " + error.message });
  }
});

// --- FASE 2: LOGIN ---
// --- CORREÇÃO DA ROTA LOGIN/OPTIONS ---
app.get('/login/options', async (req, res) => {
  try {
    if (authenticators.length === 0) {
      return res.status(404).json({ error: "Nenhuma biometria cadastrada!" });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: authenticators.map(auth => ({
        // O SEGREDO ESTÁ AQUI: Converter Buffer para String Base64URL
        id: Buffer.from(auth.credentialID).toString('base64url'), 
        type: 'public-key',
        transports: ['internal'], // Ajuda o Windows a focar no hardware nativo
      })),
      userVerification: 'preferred',
    });

    currentChallenge = options.challenge;
    res.json(options);
  } catch (error: any) {
    console.error("Erro ao gerar opções de login:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/login/verify', async (req, res) => {
  const { body } = req;
  try {
    console.log("🔍 Tentando localizar credencial ID:", body.id);

    // O SEGREDO: Convertemos o ID que vem do navegador para comparar com o Buffer que temos salvo
    const auth = authenticators.find(a => {
      const savedId = Buffer.from(a.credentialID).toString('base64url');
      return savedId === body.id;
    });

    if (!auth) {
      console.error("❌ Credencial não encontrada no array local!");
      return res.status(404).json({ error: "Dispositivo não reconhecido. Refaça o cadastro." });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: auth.credentialID,
        credentialPublicKey: auth.credentialPublicKey,
        counter: Number(auth.counter),
      },
    });

    if (verification.verified) {
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
      auth.counter = BigInt(verification.authenticationInfo.newCounter);
      console.log("✅ Login realizado com sucesso!");
      return res.json({ success: true, token });
    }

    res.status(401).json({ error: 'Assinatura inválida' });
  } catch (error: any) {
    console.error("❌ ERRO NO LOGIN:", error.message);
    res.status(500).json({ error: "Erro interno: " + error.message });
  }
});

app.post('/login/verify', async (req, res) => {
  const { body } = req;
  try {
    const auth = authenticators.find(a => a.credentialID.equals(Buffer.from(body.id, 'base64url')));
    if (!auth) throw new Error('Dispositivo não cadastrado');

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: auth.credentialID,
        credentialPublicKey: auth.credentialPublicKey,
        counter: Number(auth.counter),
      },
    });

    if (verification.verified) {
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
      auth.counter = BigInt(verification.authenticationInfo.newCounter);
      return res.json({ success: true, token });
    }
    res.status(401).json({ error: 'Falha no login' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- FASE 3: FALLBACK ---
app.post('/auth/magic-link', async (req, res) => {
  user.otp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`\n📧 [CONSOLE] Código de Fallback: ${user.otp}\n`);
  res.json({ message: "Código enviado ao console!" });
});

app.post('/auth/magic-link/verify', async (req, res) => {
    const { code } = req.body;
    if (user.otp === code) {
      const token = jwt.sign({ userId: user.id }, JWT_SECRET);
      user.otp = null;
      return res.json({ token });
    }
    res.status(401).json({ error: "Código inválido" });
});

app.listen(3001, () => console.log("🚀 Server pronto em http://localhost:3001"));