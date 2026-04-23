import React, { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import axios from 'axios';

// Definição das telas possíveis
type Screen = 'home' | 'register' | 'login' | 'magic-link' | 'magic-link-verify';

const App: React.FC = () => {
  // Estados da aplicação
  const [screen, setScreen] = useState<Screen>('home');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');

  const API_URL = 'http://localhost:3001';

  // --- FUNÇÕES DE AUTH ---

  const handleRegister = async () => {
    if (!email) return setMessage('⚠️ Digite um email primeiro!');
    try {
      setLoading(true);
      setMessage('Buscando opções de registro...');
      
      // 1. Pega as opções do servidor
      const { data: options } = await axios.get(`${API_URL}/register/options`, { params: { email } });
      
      // 2. Chama a biometria do navegador (v10 usa optionsJSON)
      const regResp = await startRegistration({ optionsJSON: options });
      
      // 3. Envia a resposta para o servidor verificar
      await axios.post(`${API_URL}/register/verify`, { body: regResp, email });
      
      setMessage('✅ Biometria cadastrada com sucesso!');
      setTimeout(() => setScreen('home'), 2000);
    } catch (error: any) {
      console.error(error);
      setMessage(`❌ Erro no registro: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email) return setMessage('⚠️ Digite um email primeiro!');
    try {
      setLoading(true);
      setMessage('Iniciando biometria...');
      
      // 1. Pega as opções de login
      const { data: options } = await axios.get(`${API_URL}/login/options`, { params: { email } });
      
      // 2. Chama a biometria/Passkey
      const authResp = await startAuthentication({ optionsJSON: options });
      
      // 3. Verifica no servidor
      const { data } = await axios.post(`${API_URL}/login/verify`, { body: authResp, email });
      
      setToken(data.token);
      setMessage('✅ Login realizado!');
    } catch (error: any) {
      console.error(error);
      setMessage(`❌ Falha no login: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMagicLink = async () => {
    if (!email) return setMessage('⚠️ Digite um email primeiro!');
    try {
      setLoading(true);
      await axios.post(`${API_URL}/auth/magic-link`, { email });
      setScreen('magic-link-verify');
      setMessage('📧 Código enviado para o console do servidor!');
    } catch (error: any) {
      setMessage('❌ Erro ao solicitar código');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMagicLink = async () => {
    try {
      setLoading(true);
      const { data } = await axios.post(`${API_URL}/auth/magic-link/verify`, { email, code: otpCode });
      setToken(data.token);
      setMessage('✅ Acesso garantido via código!');
    } catch (error: any) {
      setMessage('❌ Código inválido ou expirado');
    } finally {
      setLoading(false);
    }
  };

  // --- ESTILOS (CSS-in-JS para não precisar de arquivo extra) ---

  const styles = {
    container: { height: '100vh', display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: '#e2e8f0', fontFamily: 'sans-serif' },
    card: { background: '#1e293b', padding: '2rem', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column' as const, gap: '15px', width: '320px' },
    input: { padding: '12px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '16px' },
    btn: { padding: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const, transition: '0.2s', fontSize: '14px' },
    btnPrimary: { background: '#3b82f6', color: 'white' },
    btnSecondary: { background: '#10b981', color: 'white' },
    btnWarning: { background: '#f59e0b', color: 'white' },
    btnGhost: { background: '#64748b', color: 'white', marginTop: '10px' },
  };

  // --- RENDERIZAÇÃO ---

  if (token) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={{ textAlign: 'center' }}>🎉 Bem-vindo!</h2>
          <p style={{ fontSize: '12px', wordBreak: 'break-all', color: '#94a3b8' }}>Token: {token.substring(0, 50)}...</p>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => { setToken(''); setScreen('home'); }}>Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>🔐 Auth Moderna</h1>
        
        {/* Input de Email (Sempre visível exceto na verificação de OTP) */}
        {screen !== 'magic-link-verify' && (
          <input 
            style={styles.input} 
            type="email"
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            placeholder="Seu email institucional" 
          />
        )}

        {/* Lógica de Telas */}
        {screen === 'home' && (
          <>
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => setScreen('register')}>Registrar Nova Passkey</button>
            <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => setScreen('login')}>Entrar com Biometria</button>
            <button style={{ ...styles.btn, ...styles.btnWarning }} onClick={() => setScreen('magic-link')}>Entrar com Código (OTP)</button>
          </>
        )}

        {screen === 'register' && (
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleRegister} disabled={loading}>
            {loading ? 'Processando...' : 'Criar Credencial Agora'}
          </button>
        )}

        {screen === 'login' && (
          <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={handleLogin} disabled={loading}>
            {loading ? 'Aguardando Sensor...' : 'Validar Biometria'}
          </button>
        )}

        {screen === 'magic-link' && (
          <button style={{ ...styles.btn, ...styles.btnWarning }} onClick={handleRequestMagicLink} disabled={loading}>
            {loading ? 'Enviando...' : 'Receber Código por Email'}
          </button>
        )}

        {screen === 'magic-link-verify' && (
          <>
            <p style={{ fontSize: '14px', textAlign: 'center' }}>Digite o código enviado para <b>{email}</b></p>
            <input 
              style={styles.input} 
              value={otpCode} 
              onChange={e => setOtpCode(e.target.value)} 
              placeholder="000000" 
              maxLength={6} 
            />
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleVerifyMagicLink} disabled={loading}>
              Verificar Código
            </button>
          </>
        )}

        {/* Botão Voltar */}
        {screen !== 'home' && (
          <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => { setScreen('home'); setMessage(''); }}>
            Voltar
          </button>
        )}

        {message && (
          <p style={{ fontSize: '12px', textAlign: 'center', marginTop: '10px', color: message.includes('✅') ? '#10b981' : '#f87171' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export default App;