import React from 'react';
import {BrowserRouter as Router, Routes, Route} from 'react-router-dom';
import ChessBoard from './pages/ChessBoard';
import Settings from './pages/Settings';
import Login from './pages/Login';
function App(){
    return(
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ChessBoard/>}/>
                <Route path="/settings" element={<Settings />} />

            </Routes>
        </Router>
    )
}

export default App;