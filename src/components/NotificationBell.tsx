import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Trash2 } from 'lucide-react';
import { notificationApi } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, fmtDateTime } from '@/lib/utils';

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationApi.list,
    refetchInterval: 60_000,
  });

  const list = data?.list ?? [];
  const unread = data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => notificationApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Summit OKR` : document.title;
  }, [unread]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">{t('notif.title')}</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
              <Check /> {t('notif.markAllRead')}
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('notif.empty')}</div>
          ) : (
            list.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'group flex cursor-pointer gap-2 border-b px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/50',
                  !n.read && 'bg-primary-soft/40',
                )}
                onClick={() => {
                  markRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className={cn('truncate font-medium', n.read && 'text-muted-foreground')}>{n.title}</span>
                  </div>
                  {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[11px] text-muted-foreground/70">{fmtDateTime(n.createdAt)}</div>
                </div>
                <button
                  className="self-start rounded p-1 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(n.id);
                  }}
                  aria-label="delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
