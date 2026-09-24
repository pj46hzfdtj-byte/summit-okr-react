import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import MainLayout from '@/components/layout/MainLayout';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import SummaryPage from '@/pages/SummaryPage';
import GoalGroupPage from '@/pages/goal/GoalGroupPage';
import ObjectiveDetailPage from '@/pages/goal/ObjectiveDetailPage';
import FocusCyclePage from '@/pages/FocusCyclePage';
import TaskListPage from '@/pages/TaskListPage';
import GanttPage from '@/pages/GanttPage';
import ReviewListPage from '@/pages/ReviewListPage';
import AiAssistantPage from '@/pages/AiAssistantPage';
import VisionPage from '@/pages/VisionPage';
import RecycleBinPage from '@/pages/RecycleBinPage';
import HelpPage from '@/pages/HelpPage';
import ProfilePage from '@/pages/ProfilePage';
import NotFoundPage from '@/pages/NotFoundPage';

/** 鉴权守卫：未登录跳转 /login 并携带 redirect */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

function TitleSync() {
  const location = useLocation();
  useEffect(() => {
    const map: Record<string, string> = {
      '/summary': 'nav.summary',
      '/goal-groups': 'nav.goals',
      '/focus-cycle': 'nav.focus',
      '/tasks': 'nav.tasks',
      '/gantt': 'nav.gantt',
      '/reviews': 'nav.reviews',
      '/ai-assistant': 'nav.ai',
      '/visions': 'nav.visions',
      '/recycle-bin': 'nav.recycle',
      '/help': 'nav.help',
      '/profile': 'nav.profile',
      '/login': 'nav.login',
      '/register': 'nav.register',
    };
    const key = map[location.pathname];
    if (key) {
      import('@/i18n').then(({ default: i18n }) => {
        document.title = `${i18n.t(key)} - Summit OKR`;
      });
    }
  }, [location]);
  return null;
}

export default function App() {
  const applyToDom = useAppStore((s) => s.applyToDom);
  useEffect(() => {
    applyToDom();
  }, [applyToDom]);

  return (
    <BrowserRouter>
      <TitleSync />
      <Toaster position="top-center" richColors closeButton />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/summary" replace />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="goal-groups" element={<GoalGroupPage />} />
          <Route path="objectives/:id" element={<ObjectiveDetailPage />} />
          <Route path="focus-cycle" element={<FocusCyclePage />} />
          <Route path="tasks" element={<TaskListPage />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="reviews" element={<ReviewListPage />} />
          <Route path="ai-assistant" element={<AiAssistantPage />} />
          <Route path="visions" element={<VisionPage />} />
          <Route path="recycle-bin" element={<RecycleBinPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
