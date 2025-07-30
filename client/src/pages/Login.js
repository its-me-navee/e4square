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
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>{isRegistering ? 'Register' : 'Login'}</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />
        <div style={styles.passwordWrapper}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...styles.input, paddingRight: '44px' }}
            // style={styles.input}
          />
          <span onClick={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            {showPassword ? <EyeOff size={18} color="#ccc" /> : <Eye size={18} color="#ccc" />}
          </span>
        </div>

        <button onClick={handleEmailAuth} style={styles.primaryButton}>
          {isRegistering ? 'Register with Email' : 'Login with Email'}
        </button>

        <div style={styles.divider}>OR</div>

        <button onClick={loginWithGoogle} style={styles.googleButton}>
          Sign in with Google
        </button>

        <p
          onClick={() => setIsRegistering(!isRegistering)}
          style={styles.toggleText}
        >
          {isRegistering
            ? 'Already have an account? Login'
            : "Don't have an account? Register"}
        </p>
      </div>
    </div>
  );
};

const styles = {
  page: {
    backgroundColor: '#121212',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: '"Segoe UI", sans-serif',
  },
  card: {
    backgroundColor: '#1e1e1e',
    padding: '40px 30px',
    borderRadius: '12px',
    boxShadow: '0 0 15px rgba(0,0,0,0.5)',
    width: '90%',
    maxWidth: '400px',
    textAlign: 'center',
    color: '#fff',
  },
  title: {
    marginBottom: '20px',
  },
  input: {
    width: '100%',
    padding: '12px',
    boxSizing: 'border-box',
    margin: '10px 0',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#2a2a2a',
    color: '#fff',
    fontSize: '14px',
  },
  primaryButton: {
    width: '100%',
    // padding: '12px',
    padding: '12px 12px',
    backgroundColor: '#007bff',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '15px',
    cursor: 'pointer',
    marginTop: '10px',
  },
  googleButton: {
    width: '100%',
    // padding: '12px',
    padding: '12px 12px',
    backgroundColor: '#db4437',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '15px',
    cursor: 'pointer',
  },
  divider: {
    margin: '20px 0',
    fontSize: '12px',
    color: '#888',
  },
  toggleText: {
    marginTop: '15px',
    fontSize: '14px',
    color: '#00bfff',
    cursor: 'pointer',
  },
  passwordWrapper: {
    position: 'relative',
    width: '100%',
    margin: '10px 0',
  },
  eyeIcon: {
    position: 'absolute',
    top: '50%',
    right: '12px',
    transform: 'translateY(-50%)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },  
};

export default Login;