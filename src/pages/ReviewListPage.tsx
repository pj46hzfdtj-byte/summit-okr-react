import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Star } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { keyResultApi, objectiveApi, reviewApi, taskApi } from '@/lib/api';
import type { KrScore, Review, ReviewType } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem, Slider, Skeleton } from '@/components/ui/controls';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const typeLabel: Record<string, string> = { midterm: '期中', final: '期末' };

function scoreColor(rating: number | null | undefined): string {
  const v = rating ?? 0;
  if (v >= 0.7) return 'bg-success/15 text-success';
  if (v >= 0.4) return 'bg-warning/15 text-warning';
  return 'bg-destructive/15 text-destructive';
}

// ============ VisOKR 风格：自评 emoji ============
const SELF_EMOJIS = [
  { emoji: '😣', label: '很不理想', min: 0 },
  { emoji: '😕', label: '不太满意', min: 40 },
  { emoji: '🙂', label: '还不错', min: 60 },
  { emoji: '😊', label: '很满意', min: 70 },
  { emoji: '🤩', label: '太棒了', min: 90 },
];

function selfEmoji(rating: number | null | undefined) {
  const v = Math.round((rating ?? 0) * 100);
  let cur = SELF_EMOJIS[0];
  for (const e of SELF_EMOJIS) if (v >= e.min) cur = e;
  return cur;
}

function scoreBarClass(score: number): string {
  if (score >= 0.7) return 'bg-success';
  if (score >= 0.4) return 'bg-warning';
  return 'bg-destructive';
}

/** KR 评分滑块组（0-100 显示，提交时转 0-1） */
function KrScoreEditors({
  scores,
  getTitle,
  onChange,
}: {
  scores: KrScore[];
  getTitle: (id: string) => string;
  onChange: (next: KrScore[]) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3">
      {scores.map((ks, i) => (
        <div key={ks.keyResultId} className="rounded-lg border p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">{getTitle(ks.keyResultId)}</span>
            <span className="text-sm font-semibold tabular-nums text-primary">
              {Math.round(ks.score * 100)} 分
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[Math.round(ks.score * 100)]}
            onValueChange={([v]) => {
              const next = [...scores];
              next[i] = { ...ks, score: v / 100 };
              onChange(next);
            }}
          />
          <Input
            className="mt-2 h-8 text-xs"
            placeholder="评分说明（可选）"
            value={ks.note ?? ''}
            onChange={(e) => {
              const next = [...scores];
              next[i] = { ...ks, note: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function ReviewListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: reviews = [], isPending } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => reviewApi.list(),
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ['objectives-all'],
    queryFn: async () => (await objectiveApi.list({ page: 1, pageSize: 200 })).list,
  });

  // KR 标题映射：拉取所有被复盘目标的 KR，供列表展示标题
  const objectiveIdsKey = useMemo(
    () => Array.from(new Set(reviews.map((r) => r.objectiveId))).sort().join(','),
    [reviews],
  );
  const { data: krTitleMap = new Map<string, string>() } = useQuery({
    queryKey: ['kr-titles-for-reviews', objectiveIdsKey],
    queryFn: async () => {
      const ids = objectiveIdsKey ? objectiveIdsKey.split(',') : [];
      const map = new Map<string, string>();
      await Promise.all(
        ids.map(async (oid) => {
          try {
            const krs = await keyResultApi.listByObjective(oid);
            krs.forEach((kr) => map.set(kr.id, kr.title));
          } catch {
            // ignore
          }
        }),
      );
      return map;
    },
    enabled: !!objectiveIdsKey,
  });

  const getKrTitle = (id: string) => krTitleMap.get(id) ?? id;

  const invalidateReviews = () => {
    qc.invalidateQueries({ queryKey: ['reviews'] });
    qc.invalidateQueries({ queryKey: ['objectives-all'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
  };

  // ============ 删除 ============
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => reviewApi.remove(id),
    onSuccess: () => {
      toast.success('删除成功');
      setDeletingId(null);
      invalidateReviews();
    },
  });

  // ============ 复盘创建 ============
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedObjective, setSelectedObjective] = useState('');
  const [reviewType, setReviewType] = useState<ReviewType>('midterm');
  const [krScores, setKrScores] = useState<KrScore[]>([]);
  const [selfRating, setSelfRating] = useState(70);
  const [problems, setProblems] = useState('');
  const [solutions, setSolutions] = useState('');
  const [thoughts, setThoughts] = useState('');

  const objectiveKrsQuery = useQuery({
    queryKey: ['objective-krs', selectedObjective],
    queryFn: () => keyResultApi.listByObjective(selectedObjective),
    enabled: !!selectedObjective,
  });
  const { data: objectiveTasks = [] } = useQuery({
    queryKey: ['tasks-all'],
    queryFn: () => taskApi.list({}),
    enabled: createOpen,
  });

  const objKrs = objectiveKrsQuery.data ?? [];
  const filteredTasks = objectiveTasks.filter((tk) => tk.objectiveId === selectedObjective);
  const taskStats = {
    total: filteredTasks.length,
    done: filteredTasks.filter((tk) => tk.status === 'completed').length,
    rate: filteredTasks.length
      ? Math.round((filteredTasks.filter((tk) => tk.status === 'completed').length / filteredTasks.length) * 100)
      : 0,
  };

  const selectedObj = objectives.find((o) => o.id === selectedObjective);
  const canFinalReview =
    !!selectedObj && (selectedObj.status === 'pending_review' || selectedObj.status === 'in_progress');

  // 初始化 KR 评分：用进度作为初始参考（对应 Vue 的 watch(selectedObjective)）
  useEffect(() => {
    if (!createOpen || !selectedObjective) return;
    if (objectiveKrsQuery.isPending || objectiveKrsQuery.isFetching) return;
    setKrScores(
      objKrs.map((kr) => {
        let progress = 0;
        if (kr.targetValue !== kr.initialValue) {
          progress = (kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue);
        }
        return { keyResultId: kr.id, score: Math.max(0, Math.min(1, progress)), note: '' };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objKrs, selectedObjective, createOpen]);

  const createKrTitle = (id: string) => objKrs.find((k) => k.id === id)?.title ?? getKrTitle(id);

  const openCreateDialog = () => {
    setSelectedObjective('');
    setReviewType('midterm');
    setKrScores([]);
    setSelfRating(70);
    setProblems('');
    setSolutions('');
    setThoughts('');
    setCreateOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      reviewApi.create({
        objectiveId: selectedObjective,
        type: reviewType,
        krScores: krScores.map((s) => ({
          keyResultId: s.keyResultId,
          score: s.score,
          note: s.note || undefined,
        })),
        selfRating: selfRating / 100,
        problems: problems || undefined,
        solutions: solutions || undefined,
        thoughts: thoughts || undefined,
      }),
    onSuccess: () => {
      toast.success(reviewType === 'final' ? '期末复盘完成，目标已结束' : '期中复盘已创建');
      setCreateOpen(false);
      invalidateReviews();
    },
    onError: () => {
      // 错误 toast 由 http 拦截器统一处理
    },
  });

  const handleCreateReview = () => {
    if (!selectedObjective) {
      toast.warning('请选择目标');
      return;
    }
    if (krScores.length === 0) {
      toast.warning('该目标没有关键结果，无法复盘');
      return;
    }
    createMutation.mutate();
  };

  // ============ 期中复盘编辑 ============
  const [editOpen, setEditOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [editKrScores, setEditKrScores] = useState<KrScore[]>([]);
  const [editSelfRating, setEditSelfRating] = useState(70);
  const [editProblems, setEditProblems] = useState('');
  const [editSolutions, setEditSolutions] = useState('');
  const [editThoughts, setEditThoughts] = useState('');

  const openEditDialog = (r: Review) => {
    setEditingReview(r);
    setEditKrScores(r.krScores?.map((s) => ({ ...s })) ?? []);
    setEditSelfRating(Math.round((r.selfRating ?? 0) * 100));
    setEditProblems(r.problems ?? '');
    setEditSolutions(r.solutions ?? '');
    setEditThoughts(r.thoughts ?? '');
    setEditOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      reviewApi.update(editingReview!.id, {
        krScores: editKrScores.map((s) => ({
          keyResultId: s.keyResultId,
          score: s.score,
          note: s.note || undefined,
        })),
        selfRating: editSelfRating / 100,
        problems: editProblems || null,
        solutions: editSolutions || null,
        thoughts: editThoughts || null,
      }),
    onSuccess: () => {
      toast.success('复盘已更新（新版本）');
      setEditOpen(false);
      invalidateReviews();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{t('review.title')}</h2>
        <Button onClick={openCreateDialog}>
          <Plus /> 新建复盘
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          {isPending && <Skeleton className="h-24 w-full" />}

          {!isPending && reviews.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Star className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t('review.empty')}</p>
              <Button onClick={openCreateDialog}>
                <Plus /> 立即创建
              </Button>
            </div>
          )}

          {/* 复盘时间线 */}
          {!isPending && reviews.length > 0 && (
            <div className="relative flex flex-col gap-6 pl-6">
              <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
              {reviews.map((r) => (
                <div key={r.id} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border-2 border-card',
                      r.type === 'final' ? 'bg-success' : 'bg-warning',
                    )}
                  />
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {dayjs(r.createdAt).format('YYYY-MM-DD HH:mm')}
                  </div>
                  <div className="mt-1 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={r.type === 'final' ? 'success' : 'warning'}>{typeLabel[r.type]}</Badge>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                        v{r.version}
                      </span>
                      {/* VisOKR 风格：大分数 + emoji */}
                      <div className={cn('review-hero-score flex items-center gap-2 rounded-md px-3.5 py-1', scoreColor(r.selfRating))}>
                        <span className="hero-emoji text-[26px] leading-none">{selfEmoji(r.selfRating).emoji}</span>
                        <span className="hero-value font-mono text-3xl font-extrabold leading-none">
                          {Math.round((r.selfRating ?? 0) * 100)}
                        </span>
                        <span className="hero-meta flex flex-col gap-0.5">
                          <span className="hero-label text-xs font-semibold">自评 · {selfEmoji(r.selfRating).label}</span>
                          {r.objectiveScore != null && (
                            <span className="hero-sub text-xs opacity-80">目标得分 {r.objectiveScore}</span>
                          )}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {objectives.find((o) => o.id === r.objectiveId)?.title ?? ''}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        {r.type === 'midterm' && (
                          <Button variant="ghost" size="sm" className="text-primary" onClick={() => openEditDialog(r)}>
                            {t('common.edit')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeletingId(r.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>

                    {/* KR 评分明细 */}
                    {r.krScores?.length > 0 && (
                      <div className="my-2 flex flex-col gap-1.5 border-t pt-2">
                        {r.krScores.map((ks) => (
                          <div key={ks.keyResultId} className="flex items-center gap-3">
                            <span className="min-w-24 truncate text-sm text-muted-foreground">
                              {getKrTitle(ks.keyResultId)}
                            </span>
                            <Progress
                              value={Math.round(ks.score * 100)}
                              className="max-w-44 flex-1"
                              indicatorClassName={scoreBarClass(ks.score)}
                            />
                            <span className="w-8 text-right font-mono text-sm font-semibold tabular-nums">
                              {Math.round(ks.score * 100)}
                            </span>
                            {ks.note && <span className="text-xs text-muted-foreground">{ks.note}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {r.problems && (
                      <div className="mt-2 border-t pt-2">
                        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">问题</div>
                        <div className="text-sm leading-relaxed">{r.problems}</div>
                      </div>
                    )}
                    {r.solutions && (
                      <div className="mt-2 border-t pt-2">
                        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">解决方案</div>
                        <div className="text-sm leading-relaxed">{r.solutions}</div>
                      </div>
                    )}
                    {r.thoughts && (
                      <div className="mt-2 border-t pt-2">
                        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">感想</div>
                        <div className="text-sm leading-relaxed">{r.thoughts}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建复盘 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-[720px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建复盘</DialogTitle>
            <DialogDescription>为目标的关键结果评分并总结问题与感想</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>选择目标 *</Label>
              <Select value={selectedObjective} onValueChange={setSelectedObjective}>
                <SelectTrigger>
                  <SelectValue placeholder="选择要复盘的目标" />
                </SelectTrigger>
                <SelectContent>
                  {objectives.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>复盘类型 *</Label>
              <RadioGroup
                value={reviewType}
                onValueChange={(v) => setReviewType(v as ReviewType)}
                className="flex items-center gap-6"
              >
                <Label className="flex cursor-pointer items-center gap-2 font-normal">
                  <RadioGroupItem value="midterm" /> 期中复盘
                </Label>
                <Label className="flex cursor-pointer items-center gap-2 font-normal">
                  <RadioGroupItem value="final" disabled={!canFinalReview} /> 期末复盘
                </Label>
              </RadioGroup>
              {!canFinalReview && (
                <span className="text-xs text-muted-foreground">目标需为「进行中」或「待复盘」才能期末复盘</span>
              )}
            </div>

            {selectedObjective && taskStats.total > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">任务完成</span>
                <Badge variant="secondary">
                  {taskStats.done}/{taskStats.total} 已完成 ({taskStats.rate}%)
                </Badge>
              </div>
            )}

            {krScores.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>KR 评分 *</Label>
                <KrScoreEditors scores={krScores} getTitle={getKrTitle} onChange={setKrScores} />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>自我评分 *</Label>
              <div className="flex items-center gap-3">
                <Slider
                  className="max-w-[420px]"
                  min={0}
                  max={100}
                  step={1}
                  value={[selfRating]}
                  onValueChange={([v]) => setSelfRating(v)}
                />
                <span className="w-10 text-right font-mono text-sm font-semibold tabular-nums">{selfRating}</span>
              </div>
              <span className="text-xs text-muted-foreground">70 分是健康的 OKR 分数</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>问题总结</Label>
              <Textarea rows={2} placeholder="遇到了什么问题？" value={problems} onChange={(e) => setProblems(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>解决方案</Label>
              <Textarea rows={2} placeholder="如何解决这些问题？" value={solutions} onChange={(e) => setSolutions(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>感想</Label>
              <Textarea rows={2} placeholder="写下你的感想" value={thoughts} onChange={(e) => setThoughts(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateReview} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 期中复盘编辑 Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] max-w-[720px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑期中复盘</DialogTitle>
            <DialogDescription>保存后将生成新的版本</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {editKrScores.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>KR 评分</Label>
                <KrScoreEditors scores={editKrScores} getTitle={getKrTitle} onChange={setEditKrScores} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>自我评分 *</Label>
              <div className="flex items-center gap-3">
                <Slider
                  className="max-w-[420px]"
                  min={0}
                  max={100}
                  step={1}
                  value={[editSelfRating]}
                  onValueChange={([v]) => setEditSelfRating(v)}
                />
                <span className="w-10 text-right font-mono text-sm font-semibold tabular-nums">{editSelfRating}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>问题总结</Label>
              <Textarea rows={2} value={editProblems} onChange={(e) => setEditProblems(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>解决方案</Label>
              <Textarea rows={2} value={editSolutions} onChange={(e) => setEditSolutions(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>感想</Label>
              <Textarea rows={2} value={editThoughts} onChange={(e) => setEditThoughts(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="animate-spin" />}
              保存新版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.notice')}</AlertDialogTitle>
            <AlertDialogDescription>确定删除该复盘记录？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
