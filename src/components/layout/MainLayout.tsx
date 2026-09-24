import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  FolderTree,
  Crosshair,
  CalendarDays,
  ChartGantt,
  PenLine,
  Sparkles,
  Sunrise,
  Trash2,
  CircleHelp,
  User,
  LogOut,
  ChevronDown,
  ChevronRight,
  Plus,
  ListFilter,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { goalGroupApi } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/overlays';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import NotificationBell from '@/components/NotificationBell';
import { cn } from '@/lib/utils';

const MENU = [
  { path: '/summary', key: 'nav.summary', icon: LayoutDashboard },
  { path: '/goal-groups', key: 'nav.goals', icon: FolderTree },
  { path: '/focus-cycle', key: 'nav.focus', icon: Crosshair },
  { path: '/tasks', key: 'nav.tasks', icon: CalendarDays },
  { path: '/gantt', key: 'nav.gantt', icon: ChartGantt },
  { path: '/reviews', key: 'nav.reviews', icon: PenLine },
  { path: '/ai-assistant', key: 'nav.ai', icon: Sparkles },
  { path: '/visions', key: 'nav.visions', icon: Sunrise },
  { path: '/recycle-bin', key: 'nav.recycle', icon: Trash2 },
  { path: '/help', key: 'nav.help', icon: CircleHelp },
  { path: '/profile', key: 'nav.profile', icon: User },
];

/** 提取名称前导 emoji（VisOKR 风格：🎯 年度目标） */
function splitEmoji(name: string): { emoji: string; text: string } {
  const m = name.match(/^([^\s]{1,2}?)\s+(.+)$/u);
  if (m && /\p{Extended_Pictographic}/u.test(m[1])) {
    return { emoji: m[1], text: m[2] };
  }
  return { emoji: '', text: name };
}

export default function MainLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // ============ 目标组树（侧边栏） ============
  const { data: groups = [] } = useQuery({
    queryKey: ['goal-groups', 'tree', false],
    queryFn: () => goalGroupApi.getTree(false),
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 顶栏 */}
      <header className="app-topbar flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          {/* macOS 红绿灯（仅 theme-macos 显示） */}
          <div className="traffic-lights hidden items-center gap-2 [.theme-macos_&]:flex" aria-hidden>
            <span className="h-3 w-3 rounded-full border border-black/10 bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full border border-black/10 bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full border border-black/10 bg-[#28c840]" />
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
            onClick={toggleSidebar}
            aria-label="toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            O
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Summit OKR</span>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-accent">
              <Avatar>
                <AvatarFallback>{user?.username?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
              </Avatar>
              <span className="max-w-24 truncate text-sm">{user?.username}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <User /> {t('nav.profile')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmLogout(true)}>
                <LogOut /> {t('common.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 侧栏 */}
        <aside
          className={cn(
            'app-sidebar shrink-0 overflow-y-auto border-r transition-[width] duration-200',
            collapsed ? 'w-14' : 'w-52',
          )}
        >
          <nav className="flex flex-col gap-0.5 p-2">
            {MENU.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                    collapsed && 'justify-center',
                    isActive
                      ? 'bg-sidebar-active text-sidebar-active-foreground'
                      : 'text-sidebar-foreground hover:bg-muted/60',
                  )
                }
                title={collapsed ? t(item.key) : undefined}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{t(item.key)}</span>}
              </NavLink>
            ))}
          </nav>

          {/* VisOKR 风格：目标组树 */}
          {!collapsed && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between px-3 pb-1.5">
                <span className="text-xs font-semibold text-muted-foreground">{t('nav.goals')}</span>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t('nav.goals')}
                    onClick={() => navigate('/goal-groups')}
                  >
                    <ListFilter className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t('goal.newGroup', { defaultValue: '新建分组' })}
                    onClick={() => navigate('/goal-groups')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {groups.map((g) => {
                  const ge = splitEmoji(g.name);
                  const isGroupActive =
                    location.pathname === '/goal-groups' &&
                    new URLSearchParams(location.search).get('group') === g.id;
                  const isOpen = !collapsedGroups.has(g.id);
                  const hasExpandable = (g.children?.length ?? 0) > 0 || (g.objectiveCount ?? 0) > 0;
                  return (
                    <div key={g.id} className="mb-1.5">
                      <div
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-lg px-2 pb-1 pt-2 transition-colors hover:bg-muted/60',
                          isGroupActive && 'bg-primary-soft',
                        )}
                        onClick={() => navigate(`/goal-groups?group=${g.id}`)}
                      >
                        <span className="shrink-0 text-[15px] leading-none">{ge.emoji || '🎯'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {ge.text || g.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {g.objectiveCount ?? 0}
                        </span>
                        {hasExpandable && (
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(g.id);
                            }}
                          >
                            <ChevronRight
                              className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')}
                            />
                          </button>
                        )}
                      </div>
                      {/* 迷你进度条 + 百分比 */}
                      <div className="mx-2 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-400"
                          style={{
                            width: `${Math.min(100, (g.progress ?? 0) * 100)}%`,
                            background: g.color,
                          }}
                        />
                      </div>
                      <div className="px-2 pt-0.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {((g.progress ?? 0) * 100).toFixed(2)}%
                      </div>

                      {isOpen && (
                        <div>
                          {(g.children ?? []).map((c) => {
                            const ce = splitEmoji(c.name);
                            const isChildActive =
                              location.pathname === '/goal-groups' &&
                              new URLSearchParams(location.search).get('group') === c.id;
                            return (
                              <div
                                key={c.id}
                                className={cn(
                                  'flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-6 pr-2 transition-colors hover:bg-muted/60',
                                  isChildActive && 'bg-primary-soft',
                                )}
                                onClick={() => navigate(`/goal-groups?group=${c.id}`)}
                              >
                                <span className="shrink-0 text-[15px] leading-none">
                                  {ce.emoji || '📁'}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
                                  {ce.text || c.name}
                                </span>
                                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                  {c.objectiveCount ?? 0}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!groups.length && (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('goal.emptyHint', { defaultValue: '暂无目标分组' })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 折叠态：仅图标圆点 */}
          {collapsed && (
            <div className="flex flex-col items-center gap-2.5 pt-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  title={g.name}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 bg-card text-[15px] transition-transform hover:scale-110"
                  style={{ borderColor: g.color }}
                  onClick={() => navigate(`/goal-groups?group=${g.id}`)}
                >
                  {splitEmoji(g.name).emoji || '🎯'}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* 内容区 */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div key={location.pathname} className="page-enter mx-auto max-w-6xl p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 退出确认 */}
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.notice')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmLogout')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
