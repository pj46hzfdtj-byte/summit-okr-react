import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ganttApi } from '@/lib/api';
import type { GanttItem } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

const DAY_MS = 86400000;
const BAR_H = 18;

/** 估算标题像素宽度（CJK ≈12px/字，拉丁 ≈7px），用于给条形右侧文字预留时间缓冲 */
function titleWidth(s: string) {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? 12 : 7;
  return w;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export default function GanttPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'all' | 'cycle'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'lagging' | 'completed'>('all');

  const { data: ganttData, isLoading } = useQuery({
    queryKey: ['gantt', scope],
    queryFn: () => ganttApi.get({ scope }),
  });

  const allItems = ganttData?.items ?? [];

  // ============ VisOKR 风格：状态 Tab 过滤 ============
  const items = useMemo(() => {
    switch (statusFilter) {
      case 'active':
        return allItems.filter((i) => i.status === 'in_progress' || i.status === 'pending_review');
      case 'lagging':
        return allItems.filter((i) => i.isLagging);
      case 'completed':
        return allItems.filter((i) => i.status === 'completed');
      default:
        return allItems;
    }
  }, [allItems, statusFilter]);

  const statusCounts = useMemo(
    () => ({
      all: allItems.length,
      active: allItems.filter((i) => i.status === 'in_progress' || i.status === 'pending_review').length,
      lagging: allItems.filter((i) => i.isLagging).length,
      completed: allItems.filter((i) => i.status === 'completed').length,
    }),
    [allItems],
  );

  const statusTabs = [
    { key: 'all' as const, label: '全部' },
    { key: 'active' as const, label: '进行中' },
    { key: 'lagging' as const, label: '滞后' },
    { key: 'completed' as const, label: '已完成' },
  ];

  // ============ 时间轴计算（dayjs） ============
  const layout = useMemo(() => {
    if (!items.length) return null;
    const starts = items.map((i) => dayjs(i.startAt).valueOf());
    const ends = items.map((i) => dayjs(i.endAt).valueOf());
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    const span = Math.max(maxEnd - minStart, DAY_MS);
    // 按绘图区约 780px 换算：把最宽标题转成时间缓冲，保证最右侧条形旁文字也放得下
    const maxLabelW = Math.max(...items.map((i) => titleWidth(i.title)));
    const labelPad = ((maxLabelW + 28) * span) / 780;
    const domainMin = minStart;
    const domainMax = maxEnd + labelPad;
    const total = domainMax - domainMin;

    const toPct = (v: number) => ((v - domainMin) / total) * 100;

    // 顶部时间刻度（6 等分）
    const ticks = Array.from({ length: 7 }, (_, k) => {
      const v = domainMin + (total * k) / 6;
      return { pct: (k / 6) * 100, label: dayjs(v).format('MM-DD') };
    });

    const today = ganttData ? dayjs(ganttData.todayLine).valueOf() : dayjs().valueOf();
    const todayPct = toPct(today);
    const todayVisible = todayPct >= 0 && todayPct <= 100;

    const rows = items.map((item, idx) => {
      const start = starts[idx];
      const end = Math.max(ends[idx], start + DAY_MS * 0.02);
      const left = toPct(start);
      const width = toPct(end) - left;
      return {
        item,
        left,
        width,
        expPct: clamp01(item.expectedProgress) * width,
        progPct: clamp01(item.currentProgress) * 100,
      };
    });

    return { rows, ticks, todayPct, todayVisible };
  }, [items, ganttData?.todayLine]);

  const tooltip = (item: GanttItem) =>
    `${item.title}\n${dayjs(item.startAt).format('MM-DD')} ~ ${dayjs(item.endAt).format('MM-DD')}\n` +
    `${t('gantt.progress')}: ${Math.round(clamp01(item.currentProgress) * 100)}% · ` +
    `${t('gantt.expected')}: ${Math.round(clamp01(item.expectedProgress) * 100)}%\n` +
    (item.isLagging ? `⚠️ ${t('gantt.lagging')}` : `✅ ${t('gantt.normal')}`);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{t('gantt.title')}</h2>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {(['all', 'cycle'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={scope === s ? 'default' : 'ghost'}
              className="h-7 rounded-md px-3 text-xs"
              onClick={() => setScope(s)}
            >
              {s === 'all' ? t('gantt.scopeAll') : t('gantt.scopeCycle')}
            </Button>
          ))}
        </div>
      </div>

      {/* VisOKR 风格：状态 Tab */}
      <div className="flex gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors',
              statusFilter === tab.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary',
            )}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
            <span className="font-mono text-xs font-bold tabular-nums opacity-75">
              {statusCounts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : !items.length || !layout ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
              <p className="text-sm">{t('gantt.empty')}</p>
            </div>
          ) : (
            <div className="pl-3 pr-2">
              {/* 时间刻度轴 */}
              <div className="relative mb-1 h-5">
                {layout.ticks.map((tick, i) => (
                  <span
                    key={i}
                    className="absolute -translate-x-1/2 text-[11px] tabular-nums text-muted-foreground"
                    style={{ left: `${tick.pct}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>

              {/* 图表主体 */}
              <div className="relative">
                {/* 纵向网格线 */}
                {layout.ticks.map((tick, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute inset-y-0 w-px bg-border/60"
                    style={{ left: `${tick.pct}%` }}
                  />
                ))}

                {/* 今日红线 + 顶部横排「今日」标签 */}
                {layout.todayVisible && (
                  <div
                    className="pointer-events-none absolute -top-1 bottom-0 z-10 w-0.5 bg-destructive"
                    style={{ left: `${layout.todayPct}%` }}
                  >
                    <span className="absolute -top-1 left-1.5 whitespace-nowrap rounded bg-destructive px-1.5 py-0.5 text-[11px] font-medium text-destructive-foreground">
                      {t('gantt.today')}
                    </span>
                  </div>
                )}

                {/* 目标行 */}
                <div className="relative">
                  {layout.rows.map(({ item, left, width, expPct, progPct }) => {
                    const color = item.isLagging ? 'var(--destructive)' : item.color;
                    const confColor =
                      item.worstConfidence === 'off_track'
                        ? 'var(--destructive)'
                        : item.worstConfidence === 'at_risk'
                          ? 'var(--warning)'
                          : null;
                    return (
                      <div
                        key={item.id}
                        className="group relative flex items-center"
                        style={{ height: BAR_H * 2 }}
                      >
                        {/* 浅色轨道 = 计划工期 */}
                        <div
                          className="absolute cursor-pointer rounded-full transition-transform group-hover:scale-y-110"
                          style={{
                            left: `${left}%`,
                            width: `max(${width}%, 2px)`,
                            height: BAR_H,
                            background: `color-mix(in srgb, ${color} 25%, transparent)`,
                            boxShadow: confColor ? `inset 0 0 0 1.5px ${confColor}` : undefined,
                          }}
                          title={tooltip(item)}
                          onClick={() => navigate(`/objectives/${item.id}`)}
                        >
                          {/* 实心填充 = 已完成进度 */}
                          {progPct > 0 && (
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${progPct}%`,
                                minWidth: progPct < 100 ? BAR_H : undefined,
                                background: color,
                              }}
                            />
                          )}
                          {/* 应达进度刻度线 */}
                          <div
                            className="absolute top-[-3px] bottom-[-3px] w-0.5 rounded bg-muted-foreground"
                            style={{ left: `${expPct}%` }}
                          />
                          {/* KR 信心度角标 */}
                          {confColor && (
                            <span
                              className="absolute top-1/2 h-2 w-2 -translate-x-3 -translate-y-1/2 rounded-full"
                              style={{ background: confColor }}
                            />
                          )}
                        </div>
                        {/* 标题贴条形右端 */}
                        <span
                          className={cn(
                            'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs',
                            item.isLagging ? 'font-medium text-destructive' : 'text-muted-foreground',
                          )}
                          style={{ left: `calc(${left + width}% + 8px)` }}
                        >
                          {item.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 图例 */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-[18px] rounded-full bg-primary/25" />
                  {t('gantt.legendDuration')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-[18px] rounded-full bg-primary" />
                  {t('gantt.legendProgress')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-3 w-0.5 rounded-full bg-muted-foreground" />
                  {t('gantt.legendExpected')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2 w-[18px] rounded-full bg-destructive" />
                  {t('gantt.legendLagging')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
