import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { visionApi } from '@/lib/api';
import type { CreateVisionDto, Objective, ObjectiveStatus, Vision, VisionStatus } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label, Skeleton } from '@/components/ui/controls';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
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

const visionBadgeVariant: Record<VisionStatus, NonNullable<BadgeProps['variant']>> = {
  upcoming: 'default',
  in_progress: 'warning',
  achieved: 'success',
  expired: 'destructive',
};

const objBadgeVariant: Record<ObjectiveStatus, NonNullable<BadgeProps['variant']>> = {
  unplanned: 'secondary',
  not_started: 'secondary',
  in_progress: 'warning',
  pending_review: 'soft',
  completed: 'success',
};

function progressIndicatorClass(p: number): string {
  if (p >= 0.7) return 'bg-success';
  if (p >= 0.4) return 'bg-warning';
  return 'bg-destructive';
}

export default function VisionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: visions, isLoading } = useQuery({ queryKey: ['visions'], queryFn: visionApi.list });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [startAge, setStartAge] = useState('');
  const [endAge, setEndAge] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Vision | null>(null);

  function openCreate() {
    setEditingId(null);
    setContent('');
    setStartAge('');
    setEndAge('');
    setDialogOpen(true);
  }

  function openEdit(v: Vision) {
    setEditingId(v.id);
    setContent(v.content);
    setStartAge(v.startAge != null ? String(v.startAge) : '');
    setEndAge(v.endAge != null ? String(v.endAge) : '');
    setDialogOpen(true);
  }

  const statusLabel: Record<VisionStatus, string> = {
    upcoming: t('vision.statusUpcoming'),
    in_progress: t('vision.statusInProgress'),
    achieved: t('vision.statusAchieved'),
    expired: t('vision.statusExpired'),
  };

  function objStatusLabel(status: ObjectiveStatus): string {
    switch (status) {
      case 'unplanned':
        return t('vision.objUnplanned');
      case 'not_started':
        return t('vision.objNotStarted');
      case 'in_progress':
        return t('vision.objInProgress');
      case 'pending_review':
        return t('vision.objPendingReview');
      case 'completed':
        return t('vision.objCompleted');
      default:
        return status;
    }
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['visions'] });

  const saveMutation = useMutation({
    mutationFn: (dto: CreateVisionDto) =>
      editingId ? visionApi.update(editingId, dto) : visionApi.create(dto),
    onSuccess: () => {
      toast.success(editingId ? '修改成功' : '创建成功');
      setDialogOpen(false);
      invalidate();
    },
  });

  const achieveMutation = useMutation({
    mutationFn: (id: string) => visionApi.markAchieved(id),
    onSuccess: () => {
      toast.success(t('vision.markAchieved'));
      invalidate();
    },
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => visionApi.resetStatus(id),
    onSuccess: () => {
      toast.success(t('vision.resetStatus'));
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => visionApi.remove(id),
    onSuccess: () => {
      toast.success(t('vision.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
  });

  function handleSave() {
    if (!content.trim()) {
      toast.warning('请输入愿景内容');
      return;
    }
    const start = startAge === '' ? undefined : Number(startAge);
    const end = endAge === '' ? undefined : Number(endAge);
    if (start != null && end != null && end <= start) {
      toast.warning('结束年龄必须大于起始年龄');
      return;
    }
    saveMutation.mutate({ content: content.trim(), startAge: start, endAge: end });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{t('vision.title')}</h2>
        <Button onClick={openCreate}>
          <Plus /> {t('vision.title')}
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && !visions?.length && (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t('vision.empty')}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visions?.map((v) => (
          <Card key={v.id} className="flex flex-col transition-transform hover:-translate-y-0.5">
            <CardContent className="flex flex-1 flex-col gap-2 p-5">
              <div>
                <Badge variant={visionBadgeVariant[v.status]}>{statusLabel[v.status]}</Badge>
              </div>
              <div className="min-h-15 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {v.content}
              </div>
              {(v.startAge != null || v.endAge != null) && (
                <div className="mt-1">
                  <Badge variant="outline">
                    {v.startAge != null && v.endAge != null
                      ? `${t('vision.ageRange', { start: v.startAge, end: v.endAge })} ${t('vision.ageUnit')}`
                      : v.startAge != null
                        ? `${v.startAge}+ ${t('vision.ageUnit')}`
                        : `~${v.endAge} ${t('vision.ageUnit')}`}
                  </Badge>
                </div>
              )}

              {v.objectives?.length ? (
                <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t('vision.linkedObjectives')}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-primary">
                      {v.objectives.length}
                    </span>
                  </div>
                  <Progress
                    value={Math.round((v.progress ?? 0) * 100)}
                    indicatorClassName={progressIndicatorClass(v.progress ?? 0)}
                  />
                  <div className="space-y-1">
                    {v.objectives.map((obj: Objective) => (
                      <div
                        key={obj.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
                        onClick={() => navigate(`/objectives/${obj.id}`)}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: obj.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{obj.title}</span>
                        <Badge variant={objBadgeVariant[obj.status]} className="shrink-0">
                          {objStatusLabel(obj.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2 rounded-lg bg-muted/60 p-3 text-center text-xs text-muted-foreground">
                  {t('vision.noLinkedObjectives')}
                </div>
              )}

              <div className="mt-auto flex items-center justify-end gap-1 border-t pt-3">
                {v.status !== 'achieved' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-success hover:text-success"
                    disabled={achieveMutation.isPending}
                    onClick={() => achieveMutation.mutate(v.id)}
                  >
                    {t('vision.markAchieved')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resetMutation.isPending}
                    onClick={() => resetMutation.mutate(v.id)}
                  >
                    {t('vision.resetStatus')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                  <Pencil /> {t('common.edit')}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(v)}>
                  {t('common.delete')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 新建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑愿景' : '新建愿景'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>愿景内容</Label>
              <Textarea
                rows={4}
                placeholder="例如：成为一名技术专家 / 环游世界 / 创办一家公司"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>年龄段（可选）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={150}
                  placeholder="起始"
                  className="w-28"
                  value={startAge}
                  onChange={(e) => setStartAge(e.target.value)}
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  type="number"
                  min={0}
                  max={150}
                  placeholder="结束"
                  className="w-28"
                  value={endAge}
                  onChange={(e) => setEndAge(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">{t('vision.ageUnit')}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vision.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('vision.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
