import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, Clock, Flame, Loader2, Plus, TriangleAlert, Bell } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { checkinApi, recordApi, summaryApi } from '@/lib/api';
import type { KeyResult } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { pct } from '@/lib/utils';

export default function SummaryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: summary } = useQuery({ queryKey: ['summary'], queryFn: summaryApi.get });
  const { data: checkin } = useQuery({ queryKey: ['checkin-status'], queryFn: checkinApi.status });

  const [note, setNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitCheckin() {
    setSubmitting(true);
    try {
      await checkinApi.upsertThisWeek((note ?? checkin?.checkIn?.note ?? '').trim() || undefined);
      toast.success('本周打卡完成，继续保持！');
      qc.invalidateQueries({ queryKey: ['checkin-status'] });
    } finally {
      setSubmitting(false);
    }
  }

  // ============ 顶部统计行（VisOKR 风格） ============
  const statRow = [
    { key: 'records', emoji: '📝', value: summary?.todayAddedRecords ?? 0, label: '今日添加记录', link: undefined as string | undefined },
    { key: 'progress', emoji: '🎯', value: summary?.inProgressObjectives ?? 0, label: '进行中目标', link: undefined as string | undefined },
    { key: 'tasks', emoji: '🔔', value: summary?.todayTaskCount ?? 0, label: '今日任务', link: '/tasks' as string | undefined },
  ];

  // ============ 周期圆环 ============
  const cycleScorePercent = summary?.activeFocusCycle ? (summary.activeFocusCycle.cycleScore ?? 0) : 0;
  const ringR = 52;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc * (1 - Math.min(1, cycleScorePercent / 100));

  const todayDeltaLabel = (() => {
    const d = summary?.todayProgressDelta;
    if (d == null) return '0';
    return (d * 100).toFixed(1).replace(/\.0$/, '');
  })();

  // ============ KR 记录快捷添加 ============
  const [recordKr, setRecordKr] = useState<KeyResult | null>(null);
  const [recordValue, setRecordValue] = useState(0);
  const [recordNote, setRecordNote] = useState('');

  function openRecordDialog(kr: KeyResult) {
    setRecordKr(kr);
    setRecordValue(kr.currentValue ?? 0);
    setRecordNote('');
  }

  const submitRecord = useMutation({
    mutationFn: () =>
      recordApi.create({
        keyResultId: recordKr!.id,
        value: recordValue,
        note: recordNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('记录已添加');
      setRecordKr(null);
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['checkin-status'] });
    },
  });

  const checkinRatio =
    checkin && checkin.totalActiveKrCount > 0
      ? Math.min(1, checkin.krUpdatedCount / checkin.totalActiveKrCount)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-bold tracking-tight">{t('summary.title')}</h2>

      {/* ===== 统计行（VisOKR 风格） ===== */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-2 p-4">
          {statRow.map((st) => (
            <div
              key={st.key}
              className={st.link ? 'flex cursor-pointer items-center gap-2' : 'flex items-center gap-2'}
              onClick={() => st.link && navigate(st.link)}
            >
              <span className="text-base leading-none">{st.emoji}</span>
              <span className="text-lg font-bold tabular-nums">{st.value}</span>
              <span className="text-sm text-muted-foreground">{st.label}</span>
              {st.link && <ArrowRight className="h-3 w-3 text-muted-foreground/60" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ===== 随机动机（VisOKR 橙色渐变横幅） ===== */}
      {summary?.randomMotivation && (
        <div className="rounded-xl border border-warning/30 bg-gradient-to-r from-warning/15 via-warning/10 to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="font-serif text-3xl leading-none text-warning">“</span>
            <p className="pt-1 text-sm font-medium leading-relaxed text-warning">{summary.randomMotivation}</p>
          </div>
        </div>
      )}

      {/* ===== 活跃专注周期（圆环卡） ===== */}
      {summary?.activeFocusCycle && (
        <Card className="overflow-hidden p-0">
          <div
            className="flex cursor-pointer items-center gap-2 border-b p-4 transition-colors hover:bg-muted/40"
            onClick={() => navigate('/focus-cycle')}
          >
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">{summary.activeFocusCycle.name}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          </div>

          <div className="flex items-center gap-8 p-5">
            {/* 圆环 */}
            <div className="relative h-[120px] w-[120px] shrink-0">
              <svg viewBox="0 0 120 120" className="h-[120px] w-[120px]">
                <circle cx="60" cy="60" r={ringR} fill="none" stroke="var(--muted)" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r={ringR} fill="none"
                  stroke="var(--primary)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-extrabold tabular-nums leading-tight">
                  {cycleScorePercent}
                  <span className="ml-px text-xs font-semibold">%</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">周期进度</div>
              </div>
            </div>

            {/* 侧边统计 */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col">
                <span className="text-xl font-extrabold leading-tight tabular-nums">
                  {todayDeltaLabel}
                  <i className="ml-0.5 text-xs font-semibold not-italic text-muted-foreground">%</i>
                </span>
                <span className="text-sm text-muted-foreground">今日增加进度</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold leading-tight tabular-nums">
                  {summary.activeFocusCycle.objectives.length}
                  <i className="ml-0.5 text-xs font-semibold not-italic text-muted-foreground">个</i>
                </span>
                <span className="text-sm text-muted-foreground">进行中目标</span>
              </div>
              {summary.cycleDaysRemaining != null && (
                <div className="flex flex-col">
                  <span className="text-xl font-extrabold leading-tight tabular-nums">
                    {summary.cycleDaysRemaining}
                    <i className="ml-0.5 text-xs font-semibold not-italic text-muted-foreground">天</i>
                  </span>
                  <span className="text-sm text-muted-foreground">周期剩余</span>
                </div>
              )}
              {summary.cycleTimeProgress != null && (
                <div className="flex flex-col">
                  <span className="text-xl font-extrabold leading-tight tabular-nums">
                    {pct(summary.cycleTimeProgress)}
                    <i className="ml-0.5 text-xs font-semibold not-italic text-muted-foreground">%</i>
                  </span>
                  <span className="text-sm text-muted-foreground">时间进度</span>
                </div>
              )}
            </div>
          </div>

          {/* 周期内目标 + KR chips */}
          <div className="border-t">
            {summary.activeFocusCycle.objectives.map((oco, idx) => (
              <div
                key={oco.objectiveId}
                className={idx > 0 ? 'border-t border-dashed p-4' : 'p-4'}
              >
                <div
                  className="mb-1.5 cursor-pointer text-sm font-semibold transition-colors hover:text-primary"
                  onClick={() => navigate(`/objectives/${oco.objectiveId}`)}
                >
                  {oco.objective?.title}
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="gap-1 rounded-full">
                    <Clock className="h-3 w-3" /> 周期内
                  </Badge>
                  <span
                    className="font-mono text-xs font-bold tabular-nums"
                    style={{ color: oco.objective?.color }}
                  >
                    {((oco.objective?.currentProgress ?? 0) * 100).toFixed(1).replace(/\.0$/, '')}%
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${pct(oco.objective?.currentProgress)}%`,
                        background: oco.objective?.color,
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                  {(oco.objective?.keyResults ?? []).map((kr) => (
                    <div
                      key={kr.id}
                      className="flex cursor-pointer flex-col gap-2 rounded-lg border p-2.5 transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-sm"
                      style={{
                        background: `color-mix(in srgb, ${oco.objective?.color || 'var(--primary)'} 12%, var(--card))`,
                        borderColor: `color-mix(in srgb, ${oco.objective?.color || 'var(--primary)'} 35%, transparent)`,
                      }}
                      onClick={() => openRecordDialog(kr)}
                    >
                      <div className="line-clamp-2 text-xs font-semibold leading-snug">
                        {kr.emoji} {kr.title}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {kr.initialValue} → {kr.targetValue}
                        </span>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Plus className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ===== 每周 Check-in ===== */}
      {checkin && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-warning" />
              每周 Check-in
            </CardTitle>
            <Badge variant={checkin.done ? 'success' : 'warning'}>
              {checkin.done ? '本周已打卡' : '本周未打卡'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-10">
              <div>
                <div className="text-lg font-bold tabular-nums">
                  {checkin.krUpdatedCount}/{checkin.totalActiveKrCount}
                </div>
                <div className="text-xs text-muted-foreground">本周已更新的 KR</div>
              </div>
              <div>
                <div className="text-lg font-bold tabular-nums">
                  {dayjs(checkin.weekStart).format('MM/DD')} - {dayjs(checkin.weekEnd).subtract(1, 'day').format('MM/DD')}
                </div>
                <div className="text-xs text-muted-foreground">本周周期</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-lg font-bold tabular-nums text-warning">
                  <Flame className="h-4 w-4" /> {checkin.streak}
                </div>
                <div className="text-xs text-muted-foreground">连续打卡周数</div>
              </div>
            </div>
            <Progress value={Math.round(checkinRatio * 100)} />
            <div className="flex items-start gap-2">
              <Textarea
                className="flex-1"
                rows={2}
                maxLength={200}
                placeholder="本周进展一句话总结，或记录遇到的困难（可选）"
                value={note ?? checkin.checkIn?.note ?? ''}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button onClick={submitCheckin} disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                {checkin.done ? '更新打卡' : '完成打卡'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 今日任务 */}
      {summary && summary.todayTasks.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('summary.todayTasks')}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
              查看全部
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-0.5">
              {summary.todayTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                    style={
                      task.status === 'completed'
                        ? { borderColor: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }
                        : undefined
                    }
                  >
                    {task.status === 'completed' && <CircleCheck className="h-3.5 w-3.5 text-success" />}
                  </span>
                  <span className={task.status === 'completed' ? 'text-sm text-muted-foreground/60 line-through' : 'text-sm'}>
                    {task.title}
                  </span>
                  {task.scheduledAt && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {dayjs(task.scheduledAt).format('HH:mm')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 滞后目标 */}
      {summary && summary.laggingObjectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <TriangleAlert className="h-4 w-4" /> {t('summary.lagging')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0.5">
              {summary.laggingObjectives.map((obj) => (
                <div
                  key={obj.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  onClick={() => navigate(`/objectives/${obj.id}`)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: obj.color }} />
                  <span className="min-w-28 truncate text-sm">{obj.title}</span>
                  <Progress
                    value={pct(obj.currentProgress)}
                    className="max-w-48 flex-1"
                    indicatorClassName="bg-warning"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-warning">{pct(obj.currentProgress)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 快捷添加记录 Dialog ===== */}
      <Dialog open={!!recordKr} onOpenChange={(open) => !open && setRecordKr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>添加记录</DialogTitle>
          </DialogHeader>
          {recordKr && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
                <span className="text-2xl">{recordKr.emoji}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{recordKr.title}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {recordKr.initialValue} → {recordKr.targetValue}（当前 {recordKr.currentValue}）
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>数值</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={recordValue}
                  onChange={(e) => setRecordValue(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Input
                  maxLength={100}
                  placeholder="可选"
                  value={recordNote}
                  onChange={(e) => setRecordNote(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRecordKr(null)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => submitRecord.mutate()} disabled={submitRecord.isPending}>
                  {submitRecord.isPending && <Loader2 className="animate-spin" />}
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
