import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { UserPage } from './pages/UserPage.js';
import { ProjectPage } from './pages/ProjectPage.js';
import { SessionPage } from './pages/SessionPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { ModelAnalyticsPage } from './pages/ModelAnalyticsPage.js';
import { SearchPage } from './pages/SearchPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { DecisionsPage } from './pages/DecisionsPage.js';
import { ToolsPage } from './pages/ToolsPage.js';
import { AgentsPage } from './pages/AgentsPage.js';
import './styles.css';
import './styles.extra.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Layout route: the rail + the one org-stats fetch mount once and persist across
         * navigation, so the nav never flickers and pages don't each re-request /api/stats. */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          {/* Per-person analytics is NOT nested under /u/:author/analytics — a project's route
           * segment is basename(cwd), and a project genuinely named "analytics" would collide. */}
          <Route path="/analytics/u/:author" element={<AnalyticsPage />} />
          <Route path="/analytics/models" element={<ModelAnalyticsPage />} />
          <Route path="/analytics/models/u/:author" element={<ModelAnalyticsPage />} />
          <Route path="/u/:author" element={<UserPage />} />
          <Route path="/u/:author/:project" element={<ProjectPage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/search" element={<SearchPage />} />
          {/* Insights: team-wide decision log, tool reliability, subagents & skills. Person and
           * project scope ride in the query string (?person=&project=), not the path. */}
          <Route path="/insights" element={<Navigate to="/insights/decisions" replace />} />
          <Route path="/insights/decisions" element={<DecisionsPage />} />
          <Route path="/insights/tools" element={<ToolsPage />} />
          <Route path="/insights/agents" element={<AgentsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
