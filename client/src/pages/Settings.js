import React, { useState, useEffect } from 'react';

const Settings = ({ onSave }) => {
  const [premove, setPremove] = useState('multiple');
  const [autoQueen, setAutoQueen] = useState(true);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('e4square-settings'));
    if (saved) {
      setPremove(saved.premove);
      setAutoQueen(saved.autoQueen);
    }
  }, []);

  const saveSettings = () => {
    const newSettings = { premove, autoQueen };
    localStorage.setItem('e4square-settings', JSON.stringify(newSettings));
    if (onSave) onSave(newSettings);
  };

  return (
    <div style={{ color: 'white', padding: '20px' }}>
      <h2>Game Settings</h2>

      <div style={{ marginBottom: '20px' }}>
        <label>Premove Type:</label>
        <select value={premove} onChange={(e) => setPremove(e.target.value)}>
          <option value="none">None</option>
          <option value="single">Single</option>
          <option value="multiple">Multiple</option>
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>
          <input
            type="checkbox"
            checked={autoQueen}
            onChange={(e) => setAutoQueen(e.target.checked)}
          />
          Auto Queen on Promotion
        </label>
      </div>

      <button onClick={saveSettings}>
        Save Settings
      </button>
    </div>
  );
};

export default Settings;
