// src/utils/logout.js
import { auth } from '../firebase';

export const logout = async () => {
  try {
    await auth.signOut();
    localStorage.removeItem('authToken');
    window.location.href = '/login'; // redirect to login page
  } catch (err) {
    console.error('Logout failed:', err);
  }
};
