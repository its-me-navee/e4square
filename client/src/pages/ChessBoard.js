import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import socket from '../socket';

const chess = new Chess();

const ChessBoard = () => {
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [board, setBoard] = useState(chess.board());

    useEffect(() => {
        socket.on('connect', () => {
            console.log('Connected to server:', socket.id);
        });
    
        socket.on('opponent-move', (move) => {
            chess.move(move);
            setBoard(chess.board());
        });
    
        return () => {
            socket.off('connect');
            socket.off('opponent-move');
        };
    }, []);

    const getPieceSymbol = (piece) => {
        if (!piece) return '';
        
        // Chess.com style piece symbols
        const symbols = {
            'w': {
                'k': '♔', 'q': '♕', 'r': '♖', 'b': '♗', 'n': '♘', 'p': '♙'
            },
            'b': {
                'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
            }
        };
        
        return symbols[piece.color][piece.type] || '';
    };

    const getSquareColor = (row, col) => {
        return (row + col) % 2 === 0 ? '#EEEED2' : '#769656';
    };

    const getSquareName = (row, col) => {
        const files = 'abcdefgh';
        const ranks = '87654321';
        return files[col] + ranks[row];
    };

    const handleSquareClick = (row, col) => {
        const square = getSquareName(row, col);
        
        if (selectedSquare) {
            try {
                const move = {
                    from: selectedSquare,
                    to: square,
                    promotion: 'q'
                };
    
                const result = chess.move(move);
    
                if (result) {
                    socket.emit('move', result); // ✅ Only emit if valid move
                    setBoard(chess.board());
                    setSelectedSquare(null);
                } else {
                    const piece = chess.get(square);
                    if (piece && piece.color === chess.turn()) {
                        setSelectedSquare(square);
                    } else {
                        setSelectedSquare(null);
                    }
                }
            } catch (error) {
                console.error('Invalid move:', error);
                setSelectedSquare(null);
            }
        } else {
            const piece = chess.get(square);
            if (piece && piece.color === chess.turn()) {
                setSelectedSquare(square);
            }
        }
    };

    const resetBoard = () => {
        chess.reset();
        setBoard(chess.board());
        setSelectedSquare(null);
    };

    const isSquareSelected = (row, col) => {
        return selectedSquare === getSquareName(row, col);
    };

    const isSquareHighlighted = (row, col) => {
        if (!selectedSquare) return false;
        
        try {
            const targetSquare = getSquareName(row, col);
            const moves = chess.moves({ square: selectedSquare, verbose: true });
            return moves.some(move => move.to === targetSquare);
        } catch (error) {
            return false;
        }
    };

    const getFileLabel = (col) => {
        return String.fromCharCode(97 + col); // a, b, c, d, e, f, g, h
    };

    const getRankLabel = (row) => {
        return 8 - row; // 8, 7, 6, 5, 4, 3, 2, 1
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#312E2B',
            padding: '20px',
            fontFamily: 'Arial, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                width: '100%',
                maxWidth: '600px',
                marginBottom: '20px',
                textAlign: 'center'
            }}>
                <h1 style={{
                    color: '#FFFFFF',
                    margin: '0 0 10px 0',
                    fontSize: '28px',
                    fontWeight: 'bold'
                }}>
                    Chess Game
                </h1>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '20px'
                }}>
                    <div style={{
                        padding: '8px 16px',
                        backgroundColor: chess.turn() === 'w' ? '#FFFFFF' : '#000000',
                        color: chess.turn() === 'w' ? '#000000' : '#FFFFFF',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        border: '1px solid #666'
                    }}>
                        {chess.turn() === 'w' ? 'White to move' : 'Black to move'}
                    </div>
                    <button
                        onClick={resetBoard}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#769656',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        New Game
                    </button>
                </div>
            </div>

            {/* Chess Board Container */}
            <div style={{
                position: 'relative',
                width: '560px',
                height: '560px',
                backgroundColor: '#312E2B',
                padding: '20px',
                borderRadius: '8px'
            }}>
                {/* File labels (a-h) */}
                <div style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '20px',
                    right: '20px',
                    height: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 20px'
                }}>
                    {Array.from({ length: 8 }, (_, i) => (
                        <span key={i} style={{
                            color: '#FFFFFF',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}>
                            {getFileLabel(i)}
                        </span>
                    ))}
                </div>

                {/* Rank labels (1-8) */}
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '0',
                    bottom: '40px',
                    width: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '20px 0'
                }}>
                    {Array.from({ length: 8 }, (_, i) => (
                        <span key={i} style={{
                            color: '#FFFFFF',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}>
                            {getRankLabel(i)}
                        </span>
                    ))}
                </div>

                {/* Chess Board */}
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    width: '520px',
                    height: '520px',
                    border: '2px solid #312E2B',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8, 1fr)',
                    gridTemplateRows: 'repeat(8, 1fr)'
                }}>
                    {board.map((row, rowIndex) => 
                        row.map((piece, colIndex) => {
                            const squareColor = getSquareColor(rowIndex, colIndex);
                            const isSelected = isSquareSelected(rowIndex, colIndex);
                            const isHighlighted = isSquareHighlighted(rowIndex, colIndex);
                            
                            return (
                                <div
                                    key={`${rowIndex}-${colIndex}`}
                                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                                    style={{
                                        backgroundColor: isSelected ? '#F7EC58' : 
                                                       isHighlighted ? '#BACA44' : squareColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '52px',
                                        cursor: 'pointer',
                                        color: piece && piece.color === 'w' ? '#FFFFFF' : '#000000',
                                        textShadow: piece && piece.color === 'w' ? 
                                            '1px 1px 2px rgba(0,0,0,0.8)' : 
                                            '1px 1px 2px rgba(255,255,255,0.8)',
                                        fontWeight: 'bold',
                                        transition: 'all 0.15s ease',
                                        position: 'relative'
                                    }}
                                >
                                    {getPieceSymbol(piece)}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Game Info */}
            <div style={{
                marginTop: '20px',
                backgroundColor: '#262421',
                padding: '15px',
                borderRadius: '6px',
                maxWidth: '600px',
                width: '100%'
            }}>
                <div style={{
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    lineHeight: '1.4'
                }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Position (FEN):</div>
                    <div>{chess.fen()}</div>
                </div>
            </div>
        </div>
    );
};

export default ChessBoard; 