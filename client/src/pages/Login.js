import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
    if (token) navigate('/');
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


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
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">{isRegistering ? 'Register' : 'Login'}</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="login-input"
        />
        <div className="password-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input-password"
          />
          <span onClick={() => setShowPassword(!showPassword)} className="eye-icon">
            {showPassword ? <EyeOff size={18} color="#ccc" /> : <Eye size={18} color="#ccc" />}
          </span>
        </div>

        <button onClick={handleEmailAuth} className="primary-button">
          {isRegistering ? 'Register with Email' : 'Login with Email'}
        </button>

        <div className="divider">OR</div>

        <button onClick={loginWithGoogle} className="google-button">
          Sign in with Google
        </button>

        <p
          onClick={() => setIsRegistering(!isRegistering)}
          className="toggle-text"
        >
          {isRegistering
            ? 'Already have an account? Login'
            : "Don't have an account? Register"}
        </p>
      </div>
    </div>
  );
};



export default Login;