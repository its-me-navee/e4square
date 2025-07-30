import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Header from '../components/Header';
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
      <div className="loading-container">
        <div className="loading-text-large">
          Authenticating...
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-content">
        {/* Header */}
        <Header />
        <div className="home-header">
          <h1 className="home-title">
            ♔ E4Square
          </h1>
          <p className="home-subtitle">
            Real-time chess battles
          </p>
          
        </div>

        {/* Quick Start Section */}
        <div className="quick-start-section">
          <h2 className="quick-start-title">
            ⚡ Quick Start
          </h2>
          <p className="quick-start-description">
            Start playing now
          </p>

          <div className="quick-start-buttons">
            <button
              onClick={createNewGame}
              className="create-game-button"
            >
              🚀 Create New Game
            </button>

            <button
              onClick={() => navigate('/bot')}
              className="bot-game-button"
            >
              🤖 Play with Bot
            </button>
          </div>
        </div>

        {/* Active Players Section */}
        <div className="active-players-section">
          <h2 className="active-players-title">
            🎮 Players Online ({activePlayers.length})
          </h2>
          
          {activePlayers.length === 0 ? (
            <div className="no-players-message">
              <p>No players online. Share with friends!</p>
              <p className="share-link">
                {window.location.origin}
              </p>
            </div>
          ) : (
            <div className="players-grid">
              {activePlayers.map((player) => (
                <div key={player.socketId} className="player-card">
                  <div className="player-info">
                    <h3>
                      {player.name}
                    </h3>
                    <p>
                      {player.email}
                    </p>
                  </div>
                  <button
                    onClick={() => sendInvitation(player.email)}
                    className="challenge-button"
                  >
                    🎯 Challenge
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invitation Modal */}
      {pendingInvitation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">
              🎮 Game Invitation
            </h2>
            <p className="modal-description">
              <strong>{pendingInvitation.fromName}</strong> wants to play chess with you!
            </p>
            <div className="modal-buttons">
              <button
                onClick={() => respondToInvitation(true)}
                className="accept-button"
              >
                ✅ Accept
              </button>
              <button
                onClick={() => respondToInvitation(false)}
                className="decline-button"
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