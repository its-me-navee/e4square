import React, { useState } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../firebase';

const Login = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      navigate('/');
    }
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();
      localStorage.setItem('authToken', token);
      alert('Logged in as ' + result.user.email);
      window.location.href = '/';
    } catch (err) {
      console.error('Google login failed', err);
    }
  };

  const handleEmailAuth = async () => {
    try {
      const userCredential = isRegistering
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);

      const token = await userCredential.user.getIdToken();
      localStorage.setItem('authToken', token);
      alert(`${isRegistering ? 'Registered' : 'Logged in'} as ${userCredential.user.email}`);
      window.location.href = '/';
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div style={{
  backgroundColor: '#1e1e1e', // dark background
  color: 'white',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}}>
      <h2>{isRegistering ? 'Register' : 'Login'}</h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: '8px', margin: '8px' }}
      />
      <br />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: '8px', margin: '8px' }}
      />
      <br />
      <button onClick={handleEmailAuth} style={{ padding: '8px', margin: '8px' }}>
        {isRegistering ? 'Register with Email' : 'Login with Email'}
      </button>

      <hr style={{ margin: '16px 0' }} />

      <button onClick={loginWithGoogle} style={{ padding: '10px 15px' }}>
        Login with Google
      </button>

      <p onClick={() => setIsRegistering(!isRegistering)} style={{ cursor: 'pointer', marginTop: '10px' }}>
        {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
      </p>
    </div>
  );
};

export default Login;
