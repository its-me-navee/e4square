import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Bot, Circle, Radio, RefreshCw, Swords, Target, UsersRound } from 'lucide-react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Header from '../components/Header';
import socket, { connectSocket } from '../socket';


const Home = () => {
  const [userEmail, setUserEmail] = useState('');
  const [activePlayers, setActivePlayers] = useState([]);
  const [pendingInvitation, setPendingInvitation] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const initialLobbyStatus = socket.connected ? 'connected' : 'idle';
  const [lobbyStatus, setLobbyStatusState] = useState(initialLobbyStatus);
  const [lobbyRefreshing, setLobbyRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const friendsRef = useRef(null);
  const lobbyStatusRef = useRef(initialLobbyStatus);
  const refreshTimerRef = useRef(null);
  const navigate = useNavigate();

  const setLobbyStatus = useCallback((status) => {
    lobbyStatusRef.current = status;
    setLobbyStatusState(status);
  }, []);

  const pulseLobbyRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    setLobbyRefreshing(true);
    refreshTimerRef.current = window.setTimeout(() => {
      setLobbyRefreshing(false);
      refreshTimerRef.current = null;
    }, 850);
  }, []);

  useEffect(() => () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

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
      setLobbyStatus('connected');
      socket.emit('request-active-players');
      console.log('Connected to server');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setLobbyStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
    };

    const handleConnectionIssue = () => {
      setIsConnected(false);
      setLobbyStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
    };

    const handleOnline = () => {
      setLobbyStatus('connecting');
      connectSocket({ forceRefresh: true });
    };

    const handleActivePlayers = (players) => {
      const otherPlayers = players.filter(player => player.email !== userEmail);
      setActivePlayers(otherPlayers);
    };

    const handleGameInvitation = (invitation) => {
      setPendingInvitation(invitation);
    };

    const handleInvitationAccepted = (gameData) => {
      navigate(`/game/${gameData.roomId}`);
    };

    const handleInvitationDeclined = (data) => {
      alert(`${data.from} declined your invitation`);
    };

    const handleInvitationCancelled = ({ invitationId }) => {
      setPendingInvitation((current) => (
        current?.invitationId === invitationId ? null : current
      ));
    };

    // Set up socket event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectionIssue);
    socket.on('active-players', handleActivePlayers);
    socket.on('game-invitation', handleGameInvitation);
    socket.on('invitation-accepted', handleInvitationAccepted);
    socket.on('invitation-declined', handleInvitationDeclined);
    socket.on('invitation-cancelled', handleInvitationCancelled);
    socket.io.on('reconnect_attempt', handleConnectionIssue);
    socket.io.on('reconnect_error', handleConnectionIssue);
    socket.io.on('reconnect_failed', handleConnectionIssue);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleConnectionIssue);

    if (socket.connected) {
      handleConnect();
    } else {
      setLobbyStatus(navigator.onLine === false ? 'offline' : 'connecting');
      connectSocket();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectionIssue);
      socket.off('active-players', handleActivePlayers);
      socket.off('game-invitation', handleGameInvitation);
      socket.off('invitation-accepted', handleInvitationAccepted);
      socket.off('invitation-declined', handleInvitationDeclined);
      socket.off('invitation-cancelled', handleInvitationCancelled);
      socket.io.off('reconnect_attempt', handleConnectionIssue);
      socket.io.off('reconnect_error', handleConnectionIssue);
      socket.io.off('reconnect_failed', handleConnectionIssue);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleConnectionIssue);
    };
  }, [userEmail, navigate, setLobbyStatus]);

  const connectLobby = useCallback(async () => {
    pulseLobbyRefresh();
    friendsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (socket.connected) {
      setIsConnected(true);
      setLobbyStatus('connected');
      socket.emit('request-active-players');
      return;
    }

    setLobbyStatus(navigator.onLine === false ? 'offline' : 'connecting');
    const started = await connectSocket({ forceRefresh: true });
    if (!started && navigator.onLine !== false) {
      setLobbyStatus('reconnecting');
    }
  }, [pulseLobbyRefresh, setLobbyStatus]);

  const sendInvitation = (player) => {
    const roomId = uuidv4();
    socket.emit('send-invitation', {
      toEmail: player.email,
      toSocketId: player.socketId,
      roomId
    });
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

  const openFriendsLobby = () => {
    connectLobby();
  };

  const getLobbyLabel = () => {
    if (lobbyStatus === 'connected') return 'Live server connected';
    if (lobbyStatus === 'connecting') return 'Checking live server';
    if (lobbyStatus === 'reconnecting') return 'Reconnecting to live server';
    if (lobbyStatus === 'offline') return 'Network offline';
    return 'Live presence starting';
  };

  const getLobbyState = () => {
    if (lobbyStatus === 'connected') return 'Online';
    if (lobbyStatus === 'connecting') return 'Checking';
    if (lobbyStatus === 'reconnecting') return 'Retrying';
    if (lobbyStatus === 'offline') return 'Offline';
    return 'Starting';
  };

  const isLobbyBusy = lobbyRefreshing || lobbyStatus === 'connecting';

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
    <div className="home-container app-shell">
      <Header />

      <main className="home-content">
        <section className="home-hero">
          <div>
            <div className="eyebrow">
              <Radio size={15} />
              {getLobbyLabel()}
            </div>
            <h1 className="home-title">Choose your board</h1>
            <p className="home-subtitle">
              Friends lobby, tactics, and Stockfish in one chess desk.
            </p>
          </div>

          <div className="home-chess-visual" aria-hidden="true">
            <div className="hero-board">
              {Array.from({ length: 64 }, (_, index) => {
                const row = Math.floor(index / 8);
                const isLight = (row + index) % 2 === 0;
                return <span key={index} className={isLight ? 'light' : 'dark'} />;
              })}
            </div>
            <span className="hero-piece hero-knight">♞</span>
            <span className="hero-piece hero-bishop">♗</span>
            <span className="hero-piece hero-pawn">♟</span>
          </div>

          <div className="home-status-panel">
            <span className="status-dot-row">
              <Circle size={10} fill={isConnected ? '#81b64c' : '#d9822b'} />
              {getLobbyState()}
            </span>
            <strong>{activePlayers.length}</strong>
            <span>available players</span>
          </div>
        </section>

        <section className="mode-grid" aria-label="Game modes">
          <button type="button" className="mode-card primary-mode" onClick={openFriendsLobby}>
            <span className="mode-icon"><UsersRound size={24} /></span>
            <span className="mode-label">Play With Friends</span>
            <span className="mode-detail">Live online players</span>
          </button>

          <button type="button" className="mode-card" onClick={() => navigate('/puzzles')}>
            <span className="mode-icon"><Target size={24} /></span>
            <span className="mode-label">Puzzle Trainer</span>
            <span className="mode-detail">Tactics set</span>
          </button>

          <button type="button" className="mode-card" onClick={() => navigate('/bot')}>
            <span className="mode-icon"><Bot size={24} /></span>
            <span className="mode-label">Play Bot</span>
            <span className="mode-detail">Stockfish board</span>
          </button>
        </section>

        <section className="active-players-section" ref={friendsRef}>
          <div className="section-heading">
            <div>
              <h2>Friends Online</h2>
              <p>{isConnected ? 'Challenge an available player.' : 'Reconnecting presence in the background.'}</p>
            </div>
            <div className="lobby-actions">
              <button
                type="button"
                className={`refresh-button ${isLobbyBusy ? 'is-spinning' : ''}`}
                onClick={connectLobby}
                disabled={lobbyStatus === 'connecting'}
              >
                <RefreshCw size={16} />
                {isConnected ? 'Refresh' : 'Reconnect'}
              </button>
            </div>
          </div>

          {!isConnected ? (
            <div className="empty-state">
              <UsersRound size={28} />
              <strong>Live presence is reconnecting</strong>
              <span>Online players will appear here automatically.</span>
            </div>
          ) : activePlayers.length === 0 ? (
            <div className="empty-state">
              <UsersRound size={28} />
              <strong>No one else is online yet</strong>
              <span>{window.location.origin}</span>
            </div>
          ) : (
            <div className="players-grid">
              {activePlayers.map((player) => (
                <div key={player.socketId} className="player-card">
                  <div className="player-avatar">{player.name?.slice(0, 2).toUpperCase()}</div>
                  <div className="player-info">
                    <h3>{player.name}</h3>
                    <p>{player.email === userEmail ? 'same account in another tab' : player.email}</p>
                  </div>
                  <span className="player-state">
                    <Circle size={8} fill="#81b64c" />
                    online
                  </span>
                  <button
                    onClick={() => sendInvitation(player)}
                    className="challenge-button"
                    disabled={!isConnected}
                    type="button"
                  >
                    <Swords size={16} />
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {pendingInvitation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Game Invitation</h2>
            <p className="modal-description">
              <strong>{pendingInvitation.fromName}</strong> wants to play chess with you!
            </p>
            <div className="modal-buttons">
              <button
                onClick={() => respondToInvitation(true)}
                className="accept-button"
                type="button"
              >
                Accept
              </button>
              <button
                onClick={() => respondToInvitation(false)}
                className="decline-button"
                type="button"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
