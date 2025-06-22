import React from 'react';
import {BrowserRouter as Router, Routes, Route} from 'react-router-dom';
import ChessBoard from './pages/ChessBoard';

function App(){
    return(
        <Router>
            <Routes>
                <Route path="/" element={<ChessBoard/>}/>
            </Routes>
        </Router>
    )
}

export default App;