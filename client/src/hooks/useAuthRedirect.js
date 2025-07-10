import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

export const useAuthRedirect = (navigate, setIsLoading) => {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setIsLoading(false);
      else navigate('/login');
    });
    return () => unsubscribe();
  }, [navigate]);
};
