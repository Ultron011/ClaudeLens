import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { OverviewPage } from './pages/OverviewPage.js';
import { UserPage } from './pages/UserPage.js';
import { ProjectPage } from './pages/ProjectPage.js';
import { SessionPage } from './pages/SessionPage.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/u/:author" element={<UserPage />} />
        <Route path="/u/:author/:project" element={<ProjectPage />} />
        <Route path="/session/:id" element={<SessionPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
