import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chrome,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
} from 'firebase/auth';
import { auth } from '../firebase';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let redirectResultRequest = null;

const getGoogleRedirectResult = () => {
  if (!redirectResultRequest) {
    redirectResultRequest = getRedirectResult(auth).finally(() => {
      redirectResultRequest = null;
    });
  }

  return redirectResultRequest;
};

const loginSquares = Array.from({ length: 64 }, (_, index) => {
  const row = Math.floor(index / 8);
  const file = index % 8;
  return {
    id: index,
    tone: (row + file) % 2 === 0 ? 'light' : 'dark',
    active: [18, 27, 36, 45].includes(index),
  };
});

const getAuthErrorMessage = (error) => {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email or password is incorrect.';
    case 'auth/weak-password':
      return 'Use at least 6 characters for the password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this Firebase project.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.';
    case 'auth/network-request-failed':
      return 'Network error while signing in. Check the connection and try again.';
    default:
      return error?.message || 'Sign-in failed. Try again.';
  }
};

const Login = () => {
  const navigate = useNavigate();
  const authCompletedRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(true);

  const finishAuth = useCallback(async (user) => {
    if (!user || authCompletedRef.current) return;

    authCompletedRef.current = true;

    try {
      const token = await user.getIdToken();
      localStorage.setItem('authToken', token);
      navigate('/', { replace: true });
    } catch (error) {
      authCompletedRef.current = false;
      setAuthError(getAuthErrorMessage(error));
    }
  }, [navigate]);

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (isActive && user) {
        finishAuth(user);
      }
    });

    getGoogleRedirectResult()
      .then((result) => {
        if (isActive && result?.user) {
          return finishAuth(result.user);
        }

        return null;
      })
      .catch((error) => {
        console.error('Google redirect login failed', error);
        if (isActive) {
          setAuthError(getAuthErrorMessage(error));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsCheckingRedirect(false);
        }
      });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [finishAuth]);

  const loginWithGoogle = async () => {
    if (isSubmitting || isCheckingRedirect) return;
    setAuthError('');
    setIsSubmitting(true);

    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error('Google login failed', err);
      setAuthError(getAuthErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  const completeEmailAuth = async (authRequest) => {
    try {
      const userCredential = await authRequest;
      await finishAuth(userCredential.user);
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailAuth = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setAuthError('');
    setIsSubmitting(true);

    const authRequest = isRegistering
      ? createUserWithEmailAndPassword(auth, email, password)
      : signInWithEmailAndPassword(auth, email, password);

    await completeEmailAuth(authRequest);
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-visual" aria-hidden="true">
          <div className="login-visual-topline">
            <span className="login-brand-mark">e4</span>
            <span>E4Square</span>
          </div>
          <div className="login-board-stage">
            <div className="login-board">
              {loginSquares.map((square) => (
                <span
                  key={square.id}
                  className={`login-square ${square.tone}${square.active ? ' active' : ''}`}
                />
              ))}
            </div>
            <span className="login-piece login-piece-queen">♛</span>
            <span className="login-piece login-piece-knight">♞</span>
            <span className="login-piece login-piece-pawn">♙</span>
          </div>
          <div className="login-visual-caption">
            <Sparkles size={16} />
            <span>Your next move</span>
          </div>
        </section>

        <form className="login-card" onSubmit={handleEmailAuth}>
          <div className="login-card-header">
            <span className="login-card-kicker">
              <ShieldCheck size={15} />
              Secure access
            </span>
            <h1 className="login-title">
              {isRegistering ? 'Create account' : 'Welcome back'}
            </h1>
          </div>

          <label className="login-field">
            <span className="login-field-label">Email</span>
            <span className="login-input-wrap">
              <Mail size={18} />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAuthError('');
                }}
                className="login-input"
                autoComplete="email"
                required
              />
            </span>
          </label>

          <label className="login-field">
            <span className="login-field-label">Password</span>
            <span className="password-wrapper">
              <LockKeyhole size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAuthError('');
                }}
                className="login-input-password"
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="eye-icon"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {authError && (
            <div className="login-error" role="alert">
              {authError}
            </div>
          )}

          <button
            type="submit"
            className="primary-button login-submit-button"
            disabled={isSubmitting || isCheckingRedirect}
          >
            {isRegistering ? <UserPlus size={17} /> : <LogIn size={17} />}
            {isCheckingRedirect
              ? 'Checking sign-in...'
              : isSubmitting
              ? 'Working...'
              : isRegistering
                ? 'Create account'
                : 'Sign in'}
          </button>

          <div className="divider"><span>or</span></div>

          <button
            type="button"
            onClick={loginWithGoogle}
            className="google-button"
            disabled={isSubmitting || isCheckingRedirect}
          >
            <Chrome size={17} />
            {isSubmitting ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setAuthError('');
            }}
            className="toggle-text"
          >
            {isRegistering
              ? 'Already have an account? Sign in'
              : "Don't have an account? Create one"}
          </button>
        </form>
      </div>
    </div>
  );
};



export default Login;
