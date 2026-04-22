import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import axios from 'axios';
import { useState } from 'react';

function App() {
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      const { data: options } = await axios.get('http://localhost:3001/register/options');
      const registrationResponse = await startRegistration(options);
      await axios.post('http://localhost:3001/register/verify', registrationResponse);
      alert("✅ Biometria cadastrada!");
    } catch (error: any) {
      alert("Erro: " + (error.response?.data?.error || error.message));
    }
  };

  const handleLogin = async () => {
    try {
      const { data: options } = await axios.get('http://localhost:3001/login/options');
      const authResponse = await startAuthentication(options);
      const { data } = await axios.post('http://localhost:3001/login/verify', authResponse);
      if (data.token) alert("✅ Logado com Biometria! JWT: " + data.token);
    } catch (error: any) {
      alert("Falha no login: " + error.message);
    }
  };

  const handleMagicLink = async () => {
    await axios.post('http://localhost:3001/auth/magic-link');
    alert("Código gerado! Verifique o console do terminal do servidor.");
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212', color: 'white', gap: '20px', fontFamily: 'sans-serif' }}>
      <h1>Autenticação Moderna</h1>
      
      <button onClick={handleRegister} style={btnStyle}>1. Cadastrar Biometria</button>
      <button onClick={handleLogin} style={{...btnStyle, backgroundColor: '#10b981'}}>2. Entrar com Biometria</button>
      
      <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '20px' }}>
        <p>Problemas com o sensor?</p>
        <button onClick={handleMagicLink} style={{...btnStyle, backgroundColor: '#6b7280'}}>3. Fallback: Receber Código</button>
      </div>
    </div>
  );
}

const btnStyle = { padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', width: '250px' };

export default App;