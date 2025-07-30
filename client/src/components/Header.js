// src/components/Header.js
import React, { useEffect, useState } from 'react';
import { logout } from '../utils/logout';
import { getAuth } from 'firebase/auth';

const Header = () => {
  const [username, setUsername] = useState('');

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user?.email) {
      const name = user.email.split('@')[0];
      setUsername(name);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 20px',
      color: 'white'
    }}>
      <h3 style={{ margin: 0 }}>♔ E4Square</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {username && <span style={{ fontSize: '14px', opacity: 0.8 }}>👤 {username}</span>}

        <button onClick={logout} style={{
          padding: '6px 12px',
          background: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Header;
