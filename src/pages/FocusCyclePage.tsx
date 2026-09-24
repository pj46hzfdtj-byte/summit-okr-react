import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, Loader2, Pencil, Plus, Scale, X } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { focusCycleApi, objectiveApi } from '@/lib/api';
import type { CreateFocusCycleDto } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Skeleton } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn, pct } from '@/lib/utils';

/** 权重编辑输入（el-input-number 等价：1-10 步进，失焦/回车提交） */
function WeightInput({ weight, onSave }: { weight: number; onSave: (w: number) => void }) {
  const [draft, setDraft] = useState(weight);
  useEffect(() => setDraft(weight), [weight]);

  const commit = () => {
    const w = Math.max(1, Math.min(10, Math.round(draft) || 1));
    if (w !== weight) onSave(w);
  };

  return (
    <div className="flex items-center">
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-l-md border border-r-0 border-input text-muted-foreground transition-colors hover:bg-muted"
        onClick={() => {
          const w = Math.max(1, Math.min(10, draft - 1));
          setDraft(w);
          if (w !== weight) onSave(w);
        }}
      >
        -
      </button>
      <input
        type="number"
        min={1}
        max={10}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-6 w-12 border border-input text-center text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-r-md border border-l-0 border-input text-muted-foreground transition-colors hover:bg-muted"
        onClick={() => {
          const w = Math.max(1, Math.min(10, draft + 1));
          setDraft(w);
          if (w !== weight) onSave(w);
        }}
      >
        +
      </button>
    </div>
  );
}

export default function FocusCyclePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: cycle, isPending } = useQuery({
    queryKey: ['focus-cycle'],
    queryFn: focusCycleApi.getActive,
  });

  const invalidateCycle = () => {
    qc.invalidateQueries({ queryKey: ['focus-cycle'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
    qc.invalidateQueries({ queryKey: ['gantt'] });
  };

  // ============ 候选目标（创建对话框打开时加载） ============
  const [createOpen, setCreateOpen] = useState(false);
  const { data: availableObjectives = [] } = useQuery({
    queryKey: ['objectives-in-progress'],
    queryFn: async () => (await objectiveApi.list({ status: 'in_progress', page: 1, pageSize: 200 })).list,
    enabled: createOpen,
  });

  const [form, setForm] = useState({
    name: '',
    objectiveIds: [] as string[],
    startAt: '',
    endAt: '',
    useCustomTime: false,
  });

  const openCreateDialog = () => {
    setForm({ name: '', objectiveIds: [], startAt: '', endAt: '', useCustomTime: false });
    setCreateOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (dto: CreateFocusCycleDto) => focusCycleApi.create(dto),
    onSuccess: () => {
      toast.success('专注周期创建成功');
      setCreateOpen(false);
      invalidateCycle();
    },
  });

  const handleCreate = () => {
    if (!form.name.trim() || form.objectiveIds.length === 0) {
      toast.warning('请填写名称并选择目标');
      return;
    }
    const dto: CreateFocusCycleDto = {
      name: form.name.trim(),
      objectiveIds: form.objectiveIds,
    };
    if (form.useCustomTime && form.startAt && form.endAt) {
      dto.startAt = dayjs(form.startAt).startOf('day').toISOString();
      dto.endAt = dayjs(form.endAt).endOf('day').toISOString();
    }
    createMutation.mutate(dto);
  };

  // ============ 结束周期 ============
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const endMutation = useMutation({
    mutationFn: (id: string) => focusCycleApi.endCycle(id),
    onSuccess: () => {
      toast.success('已结束');
      setEndConfirmOpen(false);
      invalidateCycle();
    },
  });

  // ============ 目标权重编辑 ============
  const weightMutation = useMutation({
    mutationFn: ({ objectiveId, weight }: { objectiveId: string; weight: number }) =>
      focusCycleApi.updateWeight(cycle!.id, objectiveId, weight),
    onSuccess: () => {
      toast.success('权重已更新');
      invalidateCycle();
    },
  });

  // ============ B5.5 编辑活跃周期 ============
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', startAt: '', endAt: '' });

  const openEditDialog = () => {
    if (!cycle) return;
    setEditForm({
      name: cycle.name,
      startAt: dayjs(cycle.startAt).format('YYYY-MM-DD'),
      endAt: dayjs(cycle.endAt).format('YYYY-MM-DD'),
    });
    setEditOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: (dto: { name: string; startAt: string; endAt: string }) =>
      focusCycleApi.update(cycle!.id, dto),
    onSuccess: () => {
      toast.success('周期已更新');
      setEditOpen(false);
      invalidateCycle();
    },
  });

  const handleUpdate = () => {
    if (!editForm.name.trim()) {
      toast.warning('请填写周期名称');
      return;
    }
    updateMutation.mutate({
      name: editForm.name.trim(),
      startAt: dayjs(editForm.startAt).startOf('day').toISOString(),
      endAt: dayjs(editForm.endAt).endOf('day').toISOString(),
    });
  };

  // ============ Helpers ============
  const daysRemaining = cycle ? dayjs(cycle.endAt).diff(dayjs(), 'day') : 0;
  const cycleProgress = (() => {
    if (!cycle) return 0;
    const total = dayjs(cycle.endAt).diff(dayjs(cycle.startAt), 'day');
    const elapsed = dayjs().diff(dayjs(cycle.startAt), 'day');
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  })();

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Crosshair className="h-5 w-5 text-primary" /> {t('focus.title')}
        </h2>
        <div className="flex items-center gap-2">
          {cycle && (
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil /> 编辑周期
            </Button>
          )}
          {!cycle ? (
            <Button onClick={openCreateDialog}>
              <Plus /> {t('focus.create')}
            </Button>
          ) : (
            <Button variant="outline" size="default" className="text-destructive" onClick={() => setEndConfirmOpen(true)}>
              <X /> 结束周期
            </Button>
          )}
        </div>
      </div>

      {isPending && <Skeleton className="h-40 w-full rounded-xl" />}

      {/* Empty State */}
      {!isPending && !cycle && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14">
            <Crosshair className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('focus.empty')}</p>
            <Button onClick={openCreateDialog}>
              <Plus /> 立即创建
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Cycle */}
      {!isPending && cycle && (
        <Card>
          <CardContent className="flex flex-col gap-6 p-6">
            {/* Cycle Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">{cycle.name}</h3>
                <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  {dayjs(cycle.startAt).format('MM/DD')}
                  <span className="text-muted-foreground/50">→</span>
                  {dayjs(cycle.endAt).format('MM/DD')}
                  <span
                    className={cn(
                      'ml-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white',
                      daysRemaining <= 7 ? 'bg-destructive' : 'bg-success',
                    )}
                  >
                    剩余 {daysRemaining} 天
                  </span>
                </div>
              </div>
              {/* Score Ring */}
              <div
                className="relative flex h-20 w-20 flex-col items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(var(--primary) ${(cycle.cycleScore ?? 0) * 1}%, var(--muted) 0)`,
                }}
              >
                <div className="absolute inset-1 rounded-full bg-card" />
                <div className="relative z-10 text-2xl font-bold tabular-nums text-primary">
                  {cycle.cycleScore ?? 0}
                </div>
                <div className="relative z-10 text-[10px] text-muted-foreground">{t('focus.cycleScore')}</div>
              </div>
            </div>

            {/* Time Progress */}
            <div className="flex flex-col gap-1">
              <Progress value={cycleProgress} />
              <span className="text-xs tabular-nums text-muted-foreground">{cycleProgress}% 时间已过</span>
            </div>

            {/* Objectives */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Scale className="h-4 w-4" />
                <span>目标与权重</span>
              </div>
              <div className="flex flex-col gap-1">
                {cycle.objectives.map((oco) => (
                  <div
                    key={oco.objectiveId}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: oco.objective?.color }} />
                    <span className="min-w-28 truncate text-sm">{oco.objective?.title}</span>
                    <Progress
                      value={pct(oco.objective?.currentProgress)}
                      className="max-w-44 flex-1"
                      indicatorClassName="bg-success"
                    />
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                      {pct(oco.objective?.currentProgress)}%
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">权重</span>
                      <WeightInput
                        weight={oco.weight}
                        onSave={(w) => weightMutation.mutate({ objectiveId: oco.objectiveId, weight: w })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 创建周期 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('focus.create')}</DialogTitle>
            <DialogDescription>选择本期要专注的目标，可为每个目标设置权重</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>周期名称 *</Label>
              <Input
                placeholder="如：2026 Q1 专注周期"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>选择目标 *</Label>
              {availableObjectives.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">没有进行中的目标可加入</p>
              ) : (
                <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                  {availableObjectives.map((obj) => (
                    <label key={obj.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                      <Checkbox
                        checked={form.objectiveIds.includes(obj.id)}
                        onCheckedChange={(c) =>
                          setForm({
                            ...form,
                            objectiveIds: c
                              ? [...form.objectiveIds, obj.id]
                              : form.objectiveIds.filter((id) => id !== obj.id),
                          })
                        }
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: obj.color }} />
                      <span className="truncate">{obj.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.useCustomTime}
                onCheckedChange={(c) => setForm({ ...form, useCustomTime: c })}
                id="custom-time"
              />
              <Label htmlFor="custom-time">自定义起止</Label>
              <span className="text-xs text-muted-foreground">关闭则自动按季度计算</span>
            </div>
            {form.useCustomTime && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>开始日期 *</Label>
                  <Input
                    type="date"
                    value={form.startAt}
                    onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>结束日期 *</Label>
                  <Input
                    type="date"
                    value={form.endAt}
                    onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑周期 Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>编辑专注周期</DialogTitle>
            <DialogDescription>修改周期名称与起止时间</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>周期名称 *</Label>
              <Input
                placeholder="如：2026 Q1 专注周期"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>开始日期 *</Label>
                <Input
                  type="date"
                  value={editForm.startAt}
                  onChange={(e) => setEditForm({ ...editForm, startAt: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>结束日期 *</Label>
                <Input
                  type="date"
                  value={editForm.endAt}
                  onChange={(e) => setEditForm({ ...editForm, endAt: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 结束周期确认 */}
      <AlertDialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>结束专注周期？</AlertDialogTitle>
            <AlertDialogDescription>结束后将不再统计周期得分，可重新创建新的专注周期。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cycle && endMutation.mutate(cycle.id)}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
