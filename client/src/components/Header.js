// src/components/Header.js
import React from 'react';
import { logout } from '../utils/logout'; // assumes you have a logout function here

const Header = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    background: '#1e1e1e',
    color: 'white'
  }}>
    <h3 style={{ margin: 0 }}>E4Square</h3>
    <button onClick={logout} style={{
      padding: '6px 12px',
      backgroundColor: '#444',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    }}>
      Logout
    </button>
  </div>
);

export default Header;
