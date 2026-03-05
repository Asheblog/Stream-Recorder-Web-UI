import { Navigate, Route, Routes } from "react-router-dom";

import { MainLayout } from "./components/MainLayout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { TaskDetailPage } from "./pages/TaskDetailPage.js";
import { TasksPage } from "./pages/TasksPage.js";
import { VideoLibraryPage } from "./pages/VideoLibraryPage.js";

export function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/videos" element={<VideoLibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
