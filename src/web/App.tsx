import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import VideoLibrary from './pages/VideoLibrary';
import Settings from './pages/Settings';
import { useThemeStore } from './stores/themeStore';
import { useEffect } from 'react';

function App() {
    const theme = useThemeStore((s) => s.theme);

    useEffect(() => {
        document.body.className = theme === 'light' ? 'light' : '';
    }, [theme]);

    return (
        <BrowserRouter>
            <Routes>
                <Route element={<MainLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/tasks" element={<TaskList />} />
                    <Route path="/tasks/:id" element={<TaskDetail />} />
                    <Route path="/videos" element={<VideoLibrary />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
