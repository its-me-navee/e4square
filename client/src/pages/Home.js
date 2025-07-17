import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import socket from '../socket';

const Home = () => {
  const [userEmail, setUserEmail] = useState('');
  const [activePlayers, setActivePlayers] = useState([]);
  const [pendingInvitation, setPendingInvitation] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check authentication status
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserEmail(user.email);
        setIsLoading(false);
      } else {
        // User is not authenticated, redirect to login
        navigate('/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!userEmail) return; // Don't set up socket if user is not authenticated

    // Socket event handlers
    const handleConnect = () => {
      setIsConnected(true);
      console.log('✅ Connected to server');
    };

    const handleActivePlayers = (players) => {
      // Filter out current user from the list
      const otherPlayers = players.filter(player => player.email !== userEmail);
      setActivePlayers(otherPlayers);
    };

    const handleGameInvitation = (invitation) => {
      setPendingInvitation(invitation);
    };

    const handleInvitationAccepted = (gameData) => {
      console.log('✅ Invitation accepted, starting game...');
      navigate(`/game/${gameData.roomId}`);
    };

    const handleInvitationDeclined = (data) => {
      alert(`${data.from} declined your invitation`);
    };

    // Set up socket event listeners
    socket.on('connect', handleConnect);
    socket.on('active-players', handleActivePlayers);
    socket.on('game-invitation', handleGameInvitation);
    socket.on('invitation-accepted', handleInvitationAccepted);
    socket.on('invitation-declined', handleInvitationDeclined);

    // Connect to socket if not already connected
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('active-players', handleActivePlayers);
      socket.off('game-invitation', handleGameInvitation);
      socket.off('invitation-accepted', handleInvitationAccepted);
      socket.off('invitation-declined', handleInvitationDeclined);
    };
  }, [userEmail, navigate]);

  const sendInvitation = (toEmail) => {
    const roomId = uuidv4();
    socket.emit('send-invitation', { toEmail, roomId });
    console.log(`🎮 Sending invitation to ${toEmail}`);
  };

  const respondToInvitation = (accepted) => {
    if (!pendingInvitation) return;

    socket.emit('respond-invitation', {
      invitationId: pendingInvitation.invitationId,
      accepted
    });

    if (accepted) {
      navigate(`/game/${pendingInvitation.roomId}`);
    }
    
    setPendingInvitation(null);
  };

  const createNewGame = () => {
    const gameId = uuidv4();
    navigate(`/game/${gameId}`);
  };

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: 'white', fontSize: '18px' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ color: 'white', fontSize: '3rem', marginBottom: '10px' }}>
            ♔ E4Square Chess
          </h1>
          <p style={{ color: 'white', fontSize: '1.2rem', opacity: 0.9 }}>
            Challenge players and enjoy real-time chess battles
          </p>
          
          {/* Connection Status */}
          <div style={{ 
            display: 'inline-block',
            padding: '8px 16px',
            borderRadius: '20px',
            backgroundColor: isConnected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
            color: isConnected ? '#4CAF50' : '#f44336',
            marginTop: '20px',
            fontSize: '14px'
          }}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>

        {/* User Info */}
        {userEmail && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.1)', 
            padding: '20px', 
            borderRadius: '10px',
            marginBottom: '30px',
            textAlign: 'center'
          }}>
            <p style={{ color: 'white', fontSize: '18px', margin: 0 }}>
              👤 Logged in as: <strong>{userEmail}</strong>
            </p>
          </div>
        )}
        {/* Quick Start Section */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          padding: '30px', 
          borderRadius: '15px',
          textAlign: 'center'
        }}>
          <h2 style={{ color: 'white', marginBottom: '20px' }}>
            ⚡ Quick Start
          </h2>
          <p style={{ color: 'white', opacity: 0.8, marginBottom: '20px' }}>
            Create a new game or practice against our AI bot
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <button
              onClick={createNewGame}
              style={{
                background: 'linear-gradient(45deg, #2196F3, #1976D2)',
                color: 'white',
                border: 'none',
                padding: '15px 30px',
                borderRadius: '25px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                transition: 'transform 0.2s'
              }}
              onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
            >
              🚀 Create New Game
            </button>

            <button
              onClick={() => navigate('/bot')}
              style={{
                background: 'linear-gradient(45deg, #9C27B0, #7B1FA2)',
                color: 'white',
                border: 'none',
                padding: '15px 30px',
                borderRadius: '25px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                transition: 'transform 0.2s'
              }}
              onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
            >
              🤖 Play with Bot
            </button>
          </div>
        </div>

        {/* Active Players Section */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          padding: '30px', 
          borderRadius: '15px',
          marginBottom: '30px'
        }}>
          <h2 style={{ color: 'white', marginBottom: '20px', textAlign: 'center' }}>
            🎮 Active Players ({activePlayers.length})
          </h2>
          
          {activePlayers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'white', opacity: 0.7 }}>
              <p>No other players online. Share this link with friends to start playing!</p>
              <p style={{ fontSize: '14px', marginTop: '10px' }}>
                {window.location.origin}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {activePlayers.map((player) => (
                <div key={player.socketId} style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  padding: '15px',
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h3 style={{ color: 'white', margin: 0, fontSize: '16px' }}>
                      {player.name}
                    </h3>
                    <p style={{ color: 'white', opacity: 0.7, margin: '5px 0 0 0', fontSize: '14px' }}>
                      {player.email}
                    </p>
                  </div>
                  <button
                    onClick={() => sendInvitation(player.email)}
                    style={{
                      background: 'linear-gradient(45deg, #4CAF50, #45a049)',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '25px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      transition: 'transform 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                    onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                  >
                    🎯 Challenge
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Start Section */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          padding: '30px', 
          borderRadius: '15px',
          textAlign: 'center'
        }}>
          <h2 style={{ color: 'white', marginBottom: '20px' }}>
            ⚡ Quick Start
          </h2>
          <p style={{ color: 'white', opacity: 0.8, marginBottom: '20px' }}>
            Create a new game and share the link with a friend
          </p>
          <button
            onClick={createNewGame}
            style={{
              background: 'linear-gradient(45deg, #2196F3, #1976D2)',
              color: 'white',
              border: 'none',
              padding: '15px 30px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              transition: 'transform 0.2s'
            }}
            onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
          >
            🚀 Create New Game
          </button>
        </div>
      </div>

      {/* Invitation Modal */}
      {pendingInvitation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '15px',
            textAlign: 'center',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h2 style={{ color: '#333', marginBottom: '20px' }}>
              🎮 Game Invitation
            </h2>
            <p style={{ color: '#666', marginBottom: '30px', fontSize: '16px' }}>
              <strong>{pendingInvitation.fromName}</strong> wants to play chess with you!
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button
                onClick={() => respondToInvitation(true)}
                style={{
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '25px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ✅ Accept
              </button>
              <button
                onClick={() => respondToInvitation(false)}
                style={{
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '25px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ❌ Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home; 