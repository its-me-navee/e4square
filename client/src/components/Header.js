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
    <div className="header">
      <h3 className="header-title">♔ E4Square</h3>

      <div className="header-user-info">
        {username && <span className="username">👤 {username}</span>}

        <button onClick={logout} className="logout-button">
          Logout
        </button>
      </div>
    </div>
  );
};

export default Header;
