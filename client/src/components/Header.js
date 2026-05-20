import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, Home, LogOut, Target, UserRound } from 'lucide-react';
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
      <NavLink to="/" className="header-brand">
        <span className="brand-mark">e4</span>
        <span>E4Square</span>
      </NavLink>

      <nav className="header-nav" aria-label="Primary navigation">
        <NavLink to="/" end>
          <Home size={16} />
          Play
        </NavLink>
        <NavLink to="/puzzles">
          <Target size={16} />
          Puzzles
        </NavLink>
        <NavLink to="/bot">
          <Bot size={16} />
          Bot
        </NavLink>
      </nav>

      <div className="header-user-info">
        {username && (
          <span className="username">
            <UserRound size={15} />
            {username}
          </span>
        )}

        <button onClick={logout} className="logout-button" title="Log out" type="button">
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Header;
