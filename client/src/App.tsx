import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import axios from 'axios';
import { useState } from 'react';

type Screen = 'home' | 'register' | 'login' | 'magic-link';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');

  const API_URL = 'http://localhost:3001';

  // ============================================
  // REGISTRO
  // ============================================

  const handleRegister = async () => {
    if (!email) {
      setMessage('❌ Informe um email');
      return;
    }

    try {
      setLoading(true);
      setMessage('⏳ Gerando challenge...');

      const { data: options } = await axios.get(`${API_URL}/register/options`, {
        params: { email },
      });

      console.log('REGISTER OPTIONS:', options);

      setMessage('📱 Use sua biometria...');

      const registrationResponse = await startRegistration({
        optionsJSON: options, // 🔥 CORRETO v10+
      });

      await axios.post(`${API_URL}/register/verify`, registrationResponse);

      setMessage('✅ Biometria cadastrada!');
      setEmail('');
      setTimeout(() => setScreen('home'), 1500);

    } catch (error: any) {
      console.error('REGISTER ERROR:', error);

      if (error.name === 'NotAllowedError') {
        setMessage('❌ Biometria cancelada pelo usuário');
      } else {
        setMessage(`❌ ${error.response?.data?.error || error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // LOGIN
  // ============================================

  const handleLogin = async () => {
    if (!email) {
      setMessage('❌ Informe um email');
      return;
    }

    try {
      setLoading(true);
      setMessage('⏳ Gerando challenge...');

      const { data: options } = await axios.get(`${API_URL}/login/options`, {
        params: { email },
      });

      console.log('LOGIN OPTIONS:', options);

      setMessage('📱 Use sua biometria...');

      const authResponse = await startAuthentication({
        optionsJSON: options, // 🔥 CORRETO v10+
      });

      const { data } = await axios.post(`${API_URL}/login/verify`, authResponse);

      setToken(data.token);
      setMessage('✅ Login realizado!');
      setEmail('');

      setTimeout(() => setScreen('home'), 1500);

    } catch (error: any) {
      console.error('LOGIN ERROR:', error);

      if (error.name === 'NotAllowedError') {
        setMessage('❌ Biometria cancelada ou timeout');
      } else {
        setMessage(`❌ ${error.response?.data?.error || error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // MAGIC LINK
  // ============================================

  const handleRequestMagicLink = async () => {
    if (!email) {
      setMessage('❌ Informe um email');
      return;
    }

    try {
      setLoading(true);
      setMessage('📧 Gerando código...');

      await axios.post(`${API_URL}/auth/magic-link`, { email });

      setMessage('✅ Código enviado (veja no console do servidor)');
      setOtpCode('');

    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMagicLink = async () => {
    try {
      setLoading(true);

      const { data } = await axios.post(`${API_URL}/auth/magic-link/verify`, {
        email,
        code: otpCode,
      });

      setToken(data.token);
      setMessage('✅ Login via código!');
      setOtpCode('');

    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // UI
  // ============================================

  const containerStyle: React.CSSProperties = {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#0f172a',
    color: '#e2e8f0',
    gap: '16px',
  };

  const inputStyle: React.CSSProperties = {
    padding: '10px',
    width: '280px',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
  };

  const btnStyle: React.CSSProperties = {
    padding: '10px',
    width: '280px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: '#3b82f6',
    color: 'white',
  };

  if (token) {
    return (
      <div style={containerStyle}>
        <h2>✅ Logado</h2>
        <code style={{ maxWidth: 400, wordBreak: 'break-all' }}>{token}</code>
        <button onClick={() => setToken('')} style={btnStyle}>
          Sair
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1>🔐 Auth Moderna</h1>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        style={inputStyle}
      />

      <button onClick={handleRegister} style={btnStyle}>
        Registrar
      </button>

      <button onClick={handleLogin} style={{ ...btnStyle, background: '#10b981' }}>
        Login
      </button>

      <button onClick={handleRequestMagicLink} style={{ ...btnStyle, background: '#f59e0b' }}>
        Magic Link
      </button>

      {otpCode !== '' && (
        <>
          <input
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            placeholder="Código"
            style={inputStyle}
          />
          <button onClick={handleVerifyMagicLink} style={btnStyle}>
            Verificar Código
          </button>
        </>
      )}

      {message && <p>{message}</p>}
    </div>
  );
}

export default App;