import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Plus, Repeat2, Trash2, TriangleAlert } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { objectiveApi, taskApi } from '@/lib/api';
import type { CreateTaskDto, RepeatRule, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, Label } from '@/components/ui/controls';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const NONE = '__none__';

const REPEAT_RULES: { value: RepeatRule; labelKey: string }[] = [
  { value: 'none', labelKey: 'task.repeat.none' },
  { value: 'daily', labelKey: 'task.repeat.daily' },
  { value: 'weekly', labelKey: 'task.repeat.weekly' },
  { value: 'monthly', labelKey: 'task.repeat.monthly' },
  { value: 'yearly', labelKey: 'task.repeat.yearly' },
  { value: 'weekdays', labelKey: 'task.repeat.weekdays' },
];

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const CN_WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// 完成庆祝提示文案（VisOKR 风格）
const CELEBRATE_MESSAGES = [
  '又近了一步，继续加油！',
  '坚持就是胜利！',
  '今天的努力看得见！',
  '离目标更近了！',
  '太棒了，保持节奏！',
];

interface TaskForm {
  title: string;
  scheduledAt: string; // datetime-local 值：YYYY-MM-DDTHH:mm
  repeatRule: RepeatRule;
  repeatEndDate: string; // YYYY-MM-DD 或 ''
  objectiveId: string; // 目标 id 或 NONE
  contribution: string;
}

function emptyForm(presetDate?: string): TaskForm {
  const scheduled = presetDate ? dayjs(presetDate).hour(9).minute(0) : dayjs();
  return {
    title: '',
    scheduledAt: scheduled.format('YYYY-MM-DDTHH:mm'),
    repeatRule: 'none',
    repeatEndDate: '',
    objectiveId: NONE,
    contribution: '',
  };
}

export default function TaskListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState(() => dayjs());
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  // 横向周日期条锚点（周一）
  const [weekAnchor, setWeekAnchor] = useState(() => dayjs().startOf('week').add(1, 'day'));
  const [celebrate, setCelebrate] = useState<{ show: boolean; title: string; sub: string; pct: string }>({
    show: false,
    title: '',
    sub: '',
    pct: '',
  });
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>(() => emptyForm());

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmKind, setConfirmKind] = useState<null | 'batch' | 'overdue'>(null);

  // ============ Data ============
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const [pending, completed] = await Promise.all([
        taskApi.list({ status: 'pending' }),
        taskApi.list({ status: 'completed' }),
      ]);
      return [...pending, ...completed];
    },
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ['objectives', 'all'],
    queryFn: async () => (await objectiveApi.list({ page: 1, pageSize: 200 })).list,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
  };

  const repeatRuleLabel = (rule: RepeatRule) => t(`task.repeat.${rule}`);

  // ============ Mutations ============
  const createMutation = useMutation({
    mutationFn: (dto: CreateTaskDto) => taskApi.create(dto),
    onSuccess: () => {
      toast.success('任务创建成功');
      setDialogOpen(false);
      invalidate();
    },
  });

  // ============ 完成庆祝提示 ============
  function triggerCelebrate(task: Task) {
    const obj = task.objectiveId ? objectives.find((o) => o.id === task.objectiveId) : null;
    const sub = obj?.title ?? '';
    const p = obj?.currentProgress != null ? `${Math.round(obj.currentProgress * 100)}%` : '';
    const msg = CELEBRATE_MESSAGES[Math.floor(Math.random() * CELEBRATE_MESSAGES.length)];
    setCelebrate({ show: true, title: msg, sub, pct: p });
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => {
      setCelebrate((c) => ({ ...c, show: false }));
    }, 2600);
  }

  const completeMutation = useMutation({
    mutationFn: (task: Task) => taskApi.complete(task.id, task.status === 'pending'),
    onSuccess: (_data, task) => {
      invalidate();
      if (task.status === 'pending') {
        triggerCelebrate(task);
        if (task.repeatRule && task.repeatRule !== 'none') {
          toast.success(`已完成，已自动生成下一个${repeatRuleLabel(task.repeatRule)}任务`);
        }
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => taskApi.remove(id),
    onSuccess: () => {
      toast.success('删除成功');
      invalidate();
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => taskApi.batchDelete(ids),
    onSuccess: (result) => {
      toast.success(`已删除 ${result.count} 个任务`);
      setSelectedIds(new Set());
      setSelectMode(false);
      invalidate();
    },
  });

  const overdueMutation = useMutation({
    mutationFn: () => taskApi.deleteOverdue(),
    onSuccess: (result) => {
      if (result.count === 0) {
        toast.info('没有过期任务需要清理');
      } else {
        toast.success(`已清理 ${result.count} 个过期任务`);
        invalidate();
      }
    },
  });

  // ============ Calendar Grid ============
  const calendarDays = useMemo(() => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    // 从包含 1 号的那周的周一开始
    let cursor = startOfMonth.subtract((startOfMonth.day() + 6) % 7, 'day');
    const days: { date: dayjs.Dayjs; inMonth: boolean; isToday: boolean }[] = [];
    while (days.length < 42) {
      days.push({
        date: cursor,
        inMonth: cursor.isSame(currentMonth, 'month'),
        isToday: cursor.isSame(dayjs(), 'day'),
      });
      cursor = cursor.add(1, 'day');
      if (cursor.isAfter(endOfMonth) && days.length % 7 === 0) break;
    }
    return days;
  }, [currentMonth]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.scheduledAt) continue;
      const key = dayjs(task.scheduledAt).format('YYYY-MM-DD');
      const arr = map.get(key);
      if (arr) arr.push(task);
      else map.set(key, [task]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf());
    }
    return map;
  }, [tasks]);

  const selectedDayTasks = tasksByDay.get(selectedDate) ?? [];
  const pendingList = selectedDayTasks.filter((task) => task.status === 'pending');
  const completedList = selectedDayTasks.filter((task) => task.status === 'completed');

  // ============ 横向周日期条（VisOKR 风格） ============
  const weekLabel = `${weekAnchor.format('M月D日')} - ${weekAnchor.add(6, 'day').format('M月D日')}`;

  const weekStrip = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = weekAnchor.add(i, 'day');
        const dateStr = d.format('YYYY-MM-DD');
        const dayTasks = tasksByDay.get(dateStr) ?? [];
        return {
          dateStr,
          weekday: WEEK_DAYS[i],
          dayNum: d.date(),
          isToday: d.isSame(dayjs(), 'day'),
          isSelected: dateStr === selectedDate,
          count: dayTasks.length,
          completed: dayTasks.filter((task) => task.status === 'completed').length,
        };
      }),
    [weekAnchor, tasksByDay, selectedDate],
  );

  // 选中日变化时，确保周条包含该日
  useEffect(() => {
    const d = dayjs(selectedDate);
    const start = weekAnchor;
    const end = start.add(6, 'day');
    if (d.isBefore(start, 'day') || d.isAfter(end, 'day')) {
      setWeekAnchor(d.startOf('week').add(1, 'day'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  function goToday() {
    const today = dayjs();
    setSelectedDate(today.format('YYYY-MM-DD'));
    setWeekAnchor(today.startOf('week').add(1, 'day'));
    setCurrentMonth(today);
  }

  const selectedDateLabel = useMemo(() => {
    const d = dayjs(selectedDate);
    return `${d.format('YYYY年 M月 D日')} 星期${CN_WEEK[d.day()]}`;
  }, [selectedDate]);

  const isOverdue = (task: Task) =>
    task.status === 'pending' && !!task.scheduledAt && dayjs(task.scheduledAt).isBefore(dayjs(), 'day');

  const getObjectiveTitle = (id?: string | null) =>
    id ? objectives.find((o) => o.id === id)?.title ?? '' : '';

  // ============ Actions ============
  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = selectedDayTasks.length > 0 && selectedDayTasks.every((task) => selectedIds.has(task.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (selectedDayTasks.length > 0 && selectedDayTasks.every((task) => prev.has(task.id))) {
        return new Set();
      }
      return new Set(selectedDayTasks.map((task) => task.id));
    });
  }

  function openDialog(presetDate?: string) {
    setForm(emptyForm(presetDate));
    setDialogOpen(true);
  }

  const hasRepeat = form.repeatRule !== 'none';

  function handleCreate() {
    if (!form.title.trim()) {
      toast.warning('请输入任务名称');
      return;
    }
    createMutation.mutate({
      title: form.title.trim(),
      scheduledAt: form.scheduledAt ? dayjs(form.scheduledAt).toISOString() : undefined,
      repeatRule: form.repeatRule,
      repeatEndDate: hasRepeat && form.repeatEndDate ? dayjs(form.repeatEndDate).toISOString() : undefined,
      objectiveId: form.objectiveId === NONE ? null : form.objectiveId,
      contribution: form.contribution.trim() || undefined,
    });
  }

  function confirmAction() {
    if (confirmKind === 'batch') batchDeleteMutation.mutate(Array.from(selectedIds));
    if (confirmKind === 'overdue') overdueMutation.mutate();
    setConfirmKind(null);
  }

  // ============ Render ============
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{t('task.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmKind('overdue')} disabled={overdueMutation.isPending}>
            <TriangleAlert className="text-warning" />
            清理过期
          </Button>
          <Button variant="outline" size="sm" className={cn(selectMode && 'border-warning text-warning')} onClick={toggleSelectMode}>
            {selectMode ? '取消选择' : '批量选择'}
          </Button>
          {selectMode && selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmKind('batch')} disabled={batchDeleteMutation.isPending}>
              <Trash2 />
              批量删除 ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" onClick={() => openDialog(selectedDate)}>
            <Plus />
            新建任务
          </Button>
        </div>
      </div>

      {/* ===== 横向周日期条（VisOKR 风格） ===== */}
      <Card>
        <CardContent className="p-2 pt-3">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setWeekAnchor((w) => w.subtract(7, 'day'))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold">{weekLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setWeekAnchor((w) => w.add(7, 'day'))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="link" size="sm" onClick={goToday}>
              回到今天
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {weekStrip.map((d) => {
              const allDone = d.count > 0 && d.completed === d.count;
              return (
                <div
                  key={d.dateStr}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-0.5 rounded-[10px] border px-1 py-2 transition-colors',
                    allDone ? 'bg-success/10' : 'border-transparent hover:bg-muted/60',
                    d.isToday && !allDone && 'bg-primary-soft',
                    d.isToday && 'border-primary/40',
                    d.isSelected && 'border-primary ring-1 ring-primary',
                  )}
                  onClick={() => setSelectedDate(d.dateStr)}
                >
                  <span className="text-xs text-muted-foreground">{d.weekday}</span>
                  <span
                    className={cn(
                      'text-base font-bold leading-tight',
                      d.isToday && 'text-primary',
                      allDone && 'text-success',
                    )}
                  >
                    {d.dayNum}
                  </span>
                  <span className="flex h-2 items-center">
                    {d.count > 0 && (
                      <i className={cn('h-1.5 w-1.5 rounded-full', allDone ? 'bg-success' : 'bg-primary')} />
                    )}
                  </span>
                  {d.count > 0 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {d.completed}/{d.count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        {/* ===== Calendar Grid ===== */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-center gap-2 border-b p-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => m.subtract(1, 'month'))}>
                <ChevronLeft />
              </Button>
              <span className="min-w-28 text-center text-base font-semibold">{currentMonth.format('YYYY年 M月')}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => m.add(1, 'month'))}>
                <ChevronRight />
              </Button>
              <Button variant="link" size="sm" onClick={goToday}>
                今天
              </Button>
            </div>

            <div className="grid grid-cols-7 border-b">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
            ) : (
              <div className="grid grid-cols-7">
                {calendarDays.map((cell) => {
                  const dateStr = cell.date.format('YYYY-MM-DD');
                  const dayTasks = tasksByDay.get(dateStr) ?? [];
                  const completedCount = dayTasks.filter((task) => task.status === 'completed').length;
                  const hasOverdue = dayTasks.some(isOverdue);
                  return (
                    <div
                      key={dateStr}
                      className={cn(
                        'flex min-h-20 cursor-pointer flex-col gap-1 border-b border-r p-1.5 transition-colors hover:bg-muted/60',
                        !cell.inMonth && 'opacity-40',
                        dateStr === selectedDate && 'bg-primary-soft ring-2 ring-inset ring-primary',
                      )}
                      onClick={() => setSelectedDate(dateStr)}
                    >
                      <div
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium',
                          cell.isToday && 'bg-primary text-primary-foreground',
                          hasOverdue && !cell.isToday && 'text-destructive',
                        )}
                      >
                        {cell.date.date()}
                      </div>
                      {dayTasks.length > 0 && (
                        <div className="flex gap-1 text-[11px] font-semibold">
                          <span className="text-success">{completedCount}</span>
                          <span className="text-muted-foreground">/{dayTasks.length}</span>
                        </div>
                      )}
                      {dayTasks.length > 0 && (
                        <div className="mt-auto flex flex-wrap gap-1">
                          {dayTasks.slice(0, 4).map((task, i) => (
                            <span
                              key={task.id}
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                task.status === 'completed' ? 'bg-success' : isOverdue(task) ? 'bg-destructive' : 'bg-primary',
                                i === 3 && dayTasks.length > 4 && 'opacity-50',
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== Selected Day Task List ===== */}
        <Card className="flex max-h-[600px] flex-col">
          <div className="flex items-center justify-between gap-2 border-b p-4 pb-3">
            <div>
              <h3 className="text-sm font-semibold">{selectedDateLabel}</h3>
              {selectedDayTasks.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {completedList.length} / {selectedDayTasks.length} 已完成
                </span>
              )}
            </div>
            {selectMode && selectedDayTasks.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                {allSelected ? '取消全选' : '全选'}
              </Button>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-2">
            {selectedDayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <p className="text-sm text-muted-foreground">{t('task.empty')}</p>
                <Button size="sm" onClick={() => openDialog(selectedDate)}>
                  <Plus />
                  添加任务
                </Button>
              </div>
            ) : (
              <>
                {pendingList.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {t('task.pending')} · {pendingList.length}
                    </div>
                    {pendingList.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        selectMode={selectMode}
                        checked={selectedIds.has(task.id)}
                        objectiveTitle={getObjectiveTitle(task.objectiveId)}
                        repeatLabel={task.repeatRule !== 'none' ? repeatRuleLabel(task.repeatRule) : ''}
                        onToggleSelect={() => toggleSelect(task.id)}
                        onToggleComplete={() => completeMutation.mutate(task)}
                        onDelete={() => deleteMutation.mutate(task.id)}
                      />
                    ))}
                  </div>
                )}
                {completedList.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {t('task.completed')} · {completedList.length}
                    </div>
                    {completedList.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        selectMode={selectMode}
                        checked={selectedIds.has(task.id)}
                        objectiveTitle={getObjectiveTitle(task.objectiveId)}
                        repeatLabel={task.repeatRule !== 'none' ? repeatRuleLabel(task.repeatRule) : ''}
                        onToggleSelect={() => toggleSelect(task.id)}
                        onToggleComplete={() => completeMutation.mutate(task)}
                        onDelete={() => deleteMutation.mutate(task.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ===== Create Task Dialog ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">标题 *</Label>
              <Input
                id="task-title"
                placeholder="任务名称"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>关联目标</Label>
              <Select value={form.objectiveId} onValueChange={(v) => setForm({ ...form, objectiveId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择关联目标（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>不关联</SelectItem>
                  {objectives.map((obj) => (
                    <SelectItem key={obj.id} value={obj.id}>
                      {obj.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-contribution">贡献说明</Label>
              <Input
                id="task-contribution"
                placeholder="该任务对目标的贡献（可选）"
                value={form.contribution}
                onChange={(e) => setForm({ ...form, contribution: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-scheduled">计划时间</Label>
              <Input
                id="task-scheduled"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('task.repeatRule')}</Label>
              <Select value={form.repeatRule} onValueChange={(v) => setForm({ ...form, repeatRule: v as RepeatRule })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择重复规则" />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_RULES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasRepeat && (
              <div className="space-y-1.5">
                <Label htmlFor="task-repeat-end">{t('task.repeatEndDate')}</Label>
                <Input
                  id="task-repeat-end"
                  type="date"
                  placeholder="不选则永久重复"
                  value={form.repeatEndDate}
                  onChange={(e) => setForm({ ...form, repeatEndDate: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirm (batch delete / clear overdue) ===== */}
      <AlertDialog open={confirmKind !== null} onOpenChange={(open) => !open && setConfirmKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmKind === 'overdue' ? '清理过期任务' : t('common.notice')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmKind === 'overdue'
                ? '将删除所有超过 7 天未完成的过期任务，确定继续？'
                : `确定批量删除 ${selectedIds.size} 个任务？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmAction}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== 浮动加号（VisOKR 风格） ===== */}
      <button
        type="button"
        title="新建任务"
        className="fixed bottom-7 right-7 z-[100] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(0,0,0,0.18)] transition-transform hover:scale-105 hover:shadow-[0_8px_20px_rgba(0,0,0,0.24)]"
        onClick={() => openDialog(selectedDate)}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ===== 完成庆祝提示（VisOKR 风格） ===== */}
      {celebrate.show && (
        <div className="fixed left-1/2 top-[72px] z-[2000] flex -translate-x-1/2 items-center gap-2.5 rounded-[14px] border border-success/40 bg-card px-5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          <span className="text-[28px] leading-none">🎉</span>
          <div className="flex flex-col">
            <span className="text-[15px] font-bold text-success">{celebrate.title}</span>
            {celebrate.sub && (
              <span className="text-xs text-muted-foreground">
                {celebrate.sub}
                {celebrate.pct && ` · ${celebrate.pct}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Task Item Row ============
function TaskItem({
  task,
  selectMode,
  checked,
  objectiveTitle,
  repeatLabel,
  onToggleSelect,
  onToggleComplete,
  onDelete,
}: {
  task: Task;
  selectMode: boolean;
  checked: boolean;
  objectiveTitle: string;
  repeatLabel: string;
  onToggleSelect: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  const overdue = task.status === 'pending' && !!task.scheduledAt && dayjs(task.scheduledAt).isBefore(dayjs(), 'day');
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-muted/60',
        task.status === 'completed' && 'bg-success/10 hover:bg-success/10',
        overdue && 'border-l-[3px] border-l-destructive pl-[5px]',
      )}
    >
      {selectMode ? (
        <Checkbox className="mt-0.5" checked={checked} onCheckedChange={onToggleSelect} />
      ) : (
        <Checkbox
          className="mt-0.5"
          checked={task.status === 'completed'}
          onCheckedChange={onToggleComplete}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums',
              task.status === 'completed' ? 'text-success' : 'text-muted-foreground',
            )}
          >
            <Clock className="h-3 w-3" />
            {task.scheduledAt ? dayjs(task.scheduledAt).format('HH:mm') : '--:--'}
          </span>
          <span
            className={cn(
              'break-words text-sm leading-relaxed',
              task.status === 'completed' && 'text-muted-foreground/60 line-through',
            )}
          >
            {task.title}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {overdue && (
            <Badge variant="destructive" className="border-destructive/30 bg-destructive/10 text-destructive">
              <TriangleAlert className="h-3 w-3" /> 过期
            </Badge>
          )}
          {repeatLabel && (
            <Badge variant="warning">
              <Repeat2 className="h-3 w-3" /> {repeatLabel}
            </Badge>
          )}
          {objectiveTitle && <Badge variant="secondary">{objectiveTitle}</Badge>}
          {task.contribution && <Badge variant="success">{task.contribution}</Badge>}
        </div>
      </div>
      {!selectMode && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
