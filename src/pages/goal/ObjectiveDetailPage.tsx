import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { keyResultApi, memoApi, objectiveApi, recordApi } from '@/lib/api';
import { CalculationTypeLabel } from '@/lib/types';
import type {
  CalculationType,
  CreateKeyResultDto,
  KeyResult,
  KrConfidence,
  Memo,
  MemoOwnerType,
  Objective,
  UpdateKeyResultDto,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Label, Separator, Switch } from '@/components/ui/controls';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { pct } from '@/lib/utils';

// ============ 常量 ============
const STATUS_BADGE: Record<string, 'secondary' | 'warning' | 'success'> = {
  unplanned: 'secondary',
  not_started: 'secondary',
  in_progress: 'warning',
  pending_review: 'warning',
  completed: 'success',
};

const CONFIDENCE_META: Record<KrConfidence, { label: string; color: string }> = {
  on_track: { label: '正常', color: '#0f9960' },
  at_risk: { label: '有风险', color: '#d97706' },
  off_track: { label: '已偏离', color: '#dc2626' },
};

function computeProgress(kr: KeyResult): number {
  if (kr.targetValue === kr.initialValue) return 0;
  const ratio = (kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue);
  return Math.max(0, Math.min(1, ratio));
}

// ============ 动机 / 可行性标签输入 ============
function TagInput({
  items,
  onChange,
  placeholder,
  variant = 'secondary',
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  variant?: 'secondary' | 'success';
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  function add() {
    const v = text.trim();
    if (v && !items.includes(v)) {
      onChange([...items, v]);
    }
    setText('');
  }
  return (
    <div className="w-full space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((m, i) => (
            <Badge key={i} variant={variant} className="gap-1 pr-1">
              {m}
              <button
                type="button"
                className="rounded-full px-1 hover:bg-black/10"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}

// ============ 备忘 Dialog（KR 级 / 记录级通用） ============
function MemoDialog({
  open,
  onOpenChange,
  ownerType,
  ownerId,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerType: MemoOwnerType;
  ownerId: string;
  title: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [content, setContent] = useState('');

  const { data: memos } = useQuery({
    queryKey: ['memos', ownerType, ownerId],
    queryFn: () => memoApi.list(ownerType, ownerId),
    enabled: open && !!ownerId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['memos', ownerType, ownerId] });

  const createMemo = useMutation({
    mutationFn: (text: string) => memoApi.create({ ownerType, ownerId, content: text }),
    onSuccess: () => {
      toast.success('备忘已添加');
      setContent('');
      invalidate();
    },
  });

  const deleteMemo = useMutation({
    mutationFn: (id: string) => memoApi.remove(id),
    onSuccess: () => {
      toast.success('删除成功');
      invalidate();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-64 space-y-1 overflow-auto">
            {(memos ?? []).map((m: Memo) => (
              <div key={m.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                <span className="min-w-0 flex-1 truncate text-sm">{m.content}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {dayjs(m.createdAt).format('MM-DD HH:mm')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive"
                  onClick={() => deleteMemo.mutate(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {open && memos?.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">暂无备忘</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={content}
              placeholder="输入备忘内容"
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && content.trim()) createMemo.mutate(content.trim());
              }}
            />
            <Button
              onClick={() => content.trim() && createMemo.mutate(content.trim())}
              disabled={createMemo.isPending}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ 主页面 ============
export default function ObjectiveDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const qc = useQueryClient();

  const { data: objective, isLoading } = useQuery({
    queryKey: ['objective', id],
    queryFn: () => objectiveApi.getById(id),
    enabled: !!id,
  });
  const keyResults = objective?.keyResults ?? [];

  const { data: objMemos } = useQuery({
    queryKey: ['memos', 'objective', id],
    queryFn: () => memoApi.list('objective', id),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['objective', id] });
    qc.invalidateQueries({ queryKey: ['goal-group-tree'] });
  };

  // ============ 目标编辑 ============
  const [objEditOpen, setObjEditOpen] = useState(false);
  const [objForm, setObjForm] = useState({
    title: '',
    color: '#409EFF',
    usePlanTime: false,
    startAt: '',
    endAt: '',
    motivations: [] as string[],
    feasibilities: [] as string[],
  });

  function openObjEdit(obj: Objective) {
    setObjForm({
      title: obj.title,
      color: obj.color ?? '#409EFF',
      usePlanTime: !!obj.startAt,
      startAt: obj.startAt ? dayjs(obj.startAt).format('YYYY-MM-DDTHH:mm') : '',
      endAt: obj.endAt ? dayjs(obj.endAt).format('YYYY-MM-DDTHH:mm') : '',
      motivations: [...(obj.motivations ?? [])],
      feasibilities: [...(obj.feasibilities ?? [])],
    });
    setObjEditOpen(true);
  }

  const updateObjective = useMutation({
    mutationFn: (v: typeof objForm) =>
      objectiveApi.update(id, {
        title: v.title.trim(),
        color: v.color,
        startAt: v.usePlanTime && v.startAt ? dayjs(v.startAt).toISOString() : null,
        endAt: v.usePlanTime && v.endAt ? dayjs(v.endAt).toISOString() : null,
        motivations: v.motivations,
        feasibilities: v.feasibilities,
      }),
    onSuccess: () => {
      toast.success('目标已更新');
      setObjEditOpen(false);
      invalidateAll();
    },
  });

  function submitObjEdit() {
    if (!objForm.title.trim()) {
      toast.warning('请输入目标标题');
      return;
    }
    updateObjective.mutate(objForm);
  }

  // ============ 目标级备忘 ============
  const [objMemoOpen, setObjMemoOpen] = useState(false);
  const [objMemoContent, setObjMemoContent] = useState('');

  const createObjMemo = useMutation({
    mutationFn: (text: string) => memoApi.create({ ownerType: 'objective', ownerId: id, content: text }),
    onSuccess: () => {
      toast.success('备忘已添加');
      setObjMemoContent('');
      qc.invalidateQueries({ queryKey: ['memos', 'objective', id] });
    },
  });

  const deleteObjMemo = useMutation({
    mutationFn: (memoId: string) => memoApi.remove(memoId),
    onSuccess: () => {
      toast.success('删除成功');
      qc.invalidateQueries({ queryKey: ['memos', 'objective', id] });
    },
  });

  // ============ KR 创建 / 编辑 ============
  const emptyKrForm = (): CreateKeyResultDto & { customFormula: string; confidence: KrConfidence } => ({
    objectiveId: id,
    title: '',
    emoji: '🌟',
    initialValue: 0,
    targetValue: 100,
    calculationType: 'sum',
    customFormula: '',
    weight: 100,
    minRecordCount: 0,
    confidence: 'on_track',
  });
  const [krDialog, setKrDialog] = useState<(ReturnType<typeof emptyKrForm> & { editId?: string }) | null>(null);

  const createKr = useMutation({
    mutationFn: (v: NonNullable<typeof krDialog>) =>
      keyResultApi.create({
        objectiveId: v.objectiveId,
        title: v.title.trim(),
        emoji: v.emoji,
        initialValue: v.initialValue,
        targetValue: v.targetValue,
        calculationType: v.calculationType,
        customFormula: v.calculationType === 'custom' ? v.customFormula : undefined,
        weight: v.weight,
        minRecordCount: v.minRecordCount,
      }),
    onSuccess: () => {
      toast.success('KR 创建成功');
      setKrDialog(null);
      invalidateAll();
    },
  });

  const updateKr = useMutation({
    mutationFn: (v: NonNullable<typeof krDialog>) => {
      const dto: UpdateKeyResultDto = {
        title: v.title.trim(),
        emoji: v.emoji,
        initialValue: v.initialValue,
        targetValue: v.targetValue,
        calculationType: v.calculationType,
        customFormula: v.calculationType === 'custom' ? v.customFormula : null,
        weight: v.weight,
        minRecordCount: v.minRecordCount,
        confidence: v.confidence,
      };
      return keyResultApi.update(v.editId!, dto);
    },
    onSuccess: () => {
      toast.success('KR 已更新');
      setKrDialog(null);
      invalidateAll();
    },
  });

  function openKrEdit(kr: KeyResult) {
    setKrDialog({
      editId: kr.id,
      objectiveId: id,
      title: kr.title,
      emoji: kr.emoji,
      initialValue: kr.initialValue,
      targetValue: kr.targetValue,
      calculationType: kr.calculationType as CalculationType,
      customFormula: kr.customFormula ?? '',
      weight: kr.weight,
      minRecordCount: kr.minRecordCount,
      confidence: (kr.confidence ?? 'on_track') as KrConfidence,
    });
  }

  function submitKr() {
    if (!krDialog) return;
    if (!krDialog.title.trim()) {
      toast.warning('请输入 KR 标题');
      return;
    }
    if (krDialog.editId) updateKr.mutate(krDialog);
    else createKr.mutate(krDialog);
  }

  const deleteKr = useMutation({
    mutationFn: (krId: string) => keyResultApi.remove(krId),
    onSuccess: () => {
      toast.success('删除成功');
      invalidateAll();
    },
  });

  const cycleConfidence = useMutation({
    mutationFn: (kr: KeyResult) => {
      const order: KrConfidence[] = ['on_track', 'at_risk', 'off_track'];
      const next = order[(order.indexOf((kr.confidence ?? 'on_track') as KrConfidence) + 1) % order.length];
      return keyResultApi.update(kr.id, { confidence: next });
    },
    onSuccess: () => invalidateAll(),
  });

  // ============ 记录添加 ============
  const [recordKr, setRecordKr] = useState<KeyResult | null>(null);
  const [recordForm, setRecordForm] = useState({ value: 0, note: '' });

  function openRecordDialog(kr: KeyResult) {
    setRecordKr(kr);
    setRecordForm({ value: kr.currentValue, note: '' });
  }

  const addRecord = useMutation({
    mutationFn: () =>
      recordApi.create({
        keyResultId: recordKr!.id,
        value: recordForm.value,
        note: recordForm.note || undefined,
      }),
    onSuccess: () => {
      toast.success('记录添加成功');
      setRecordKr(null);
      qc.invalidateQueries({ queryKey: ['kr-trend'] });
      invalidateAll();
    },
  });

  // ============ 趋势图 ============
  const [trendKr, setTrendKr] = useState<KeyResult | null>(null);
  const { data: trendData } = useQuery({
    queryKey: ['kr-trend', trendKr?.id],
    queryFn: () => recordApi.getTrend(trendKr!.id),
    enabled: !!trendKr,
  });

  // ============ KR 级 / 记录级备忘 ============
  const [krMemoKr, setKrMemoKr] = useState<KeyResult | null>(null);
  const [recordMemo, setRecordMemo] = useState<{ id: string; title: string } | null>(null);

  // ============ 渲染 ============
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  if (!objective) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-sm text-muted-foreground">目标不存在或已被删除</p>
        <Button variant="outline" onClick={() => navigate('/goal-groups')}>
          {t('nav.goals')}
        </Button>
      </div>
    );
  }

  const editable = objective.status !== 'completed';

  return (
    <div className="flex flex-col gap-4">
      {/* 头部信息卡 */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Badge variant={STATUS_BADGE[objective.status] ?? 'secondary'}>
                {t(`objective.status.${objective.status}`)}
              </Badge>
              <h2 className="flex min-w-0 items-center gap-2 text-xl font-bold tracking-tight">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: objective.color }} />
                <span className="truncate">{objective.title}</span>
              </h2>
              {objective.isLagging && <Badge variant="destructive">滞后</Badge>}
            </div>

            {/* VisOKR 风格：完成度圆环 */}
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 64 64" className="h-16 w-16">
                <circle cx="32" cy="32" r={26} fill="none" stroke="var(--muted)" strokeWidth="7" />
                <circle
                  cx="32"
                  cy="32"
                  r={26}
                  fill="none"
                  stroke={objective.color || 'var(--primary)'}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - Math.min(1, Math.max(0, objective.currentProgress ?? 0)))}
                  transform="rotate(-90 32 32)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-sm font-bold tabular-nums">
                  {Math.round((objective.currentProgress ?? 0) * 100)}
                  <i className="text-[10px] not-italic">%</i>
                </span>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Sparkles className="text-primary" />
                    {t('nav.ai')}
                    <ArrowDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/ai-assistant?tab=plan-tasks&objectiveId=${id}`)}>
                    AI 拆解任务
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/ai-assistant?tab=suggest-score&objectiveId=${id}`)}>
                    AI 复盘评分
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/ai-assistant?tab=suggest-motivations&objectiveId=${id}`)}>
                    AI 动机建议
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {editable && (
                <Button variant="outline" size="sm" onClick={() => openObjEdit(objective)}>
                  <Pencil />
                  {t('common.edit')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft />
                {t('common.back')}
              </Button>
            </div>
          </div>

          {/* 元信息 */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-4 text-sm md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">{t('objective.goalGroup')}</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 rounded-full" style={{ background: objective.goalGroup?.color }} />
                {objective.goalGroup?.name ?? '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('objective.startAt')}</div>
              <div className="mt-0.5 font-medium tabular-nums">
                {objective.startAt ? dayjs(objective.startAt).format('YYYY-MM-DD HH:mm') : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('objective.endAt')}</div>
              <div className="mt-0.5 font-medium tabular-nums">
                {objective.endAt ? dayjs(objective.endAt).format('YYYY-MM-DD HH:mm') : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('objective.currentProgress')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Progress
                  value={pct(objective.currentProgress)}
                  className="max-w-40 flex-1"
                  indicatorClassName={objective.isLagging ? 'bg-warning' : undefined}
                />
                <span className="text-xs tabular-nums">{pct(objective.currentProgress)}%</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('objective.expectedProgress')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Progress value={pct(objective.expectedProgress)} className="h-1.5 max-w-40 flex-1" />
                <span className="text-xs tabular-nums">{pct(objective.expectedProgress)}%</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('objective.krCount')}</div>
              <div className="mt-0.5 font-medium tabular-nums">{keyResults.length}</div>
            </div>
          </div>

          {/* 动机 / 可行性 / 备忘 */}
          <Tabs defaultValue="motivations">
            <TabsList>
              <TabsTrigger value="motivations">
                {t('objective.motivations')} ({objective.motivations?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="feasibilities">
                {t('objective.feasibility')} ({objective.feasibilities?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="memos">{t('review.memoTab', { defaultValue: '备忘' })} ({objMemos?.length ?? 0})</TabsTrigger>
            </TabsList>
            <TabsContent value="motivations">
              {objective.motivations?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {objective.motivations.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">暂无动机</p>
              )}
            </TabsContent>
            <TabsContent value="feasibilities">
              {objective.feasibilities?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {objective.feasibilities.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">暂无可行性</p>
              )}
            </TabsContent>
            <TabsContent value="memos">
              <div className="space-y-1">
                {(objMemos ?? []).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm">{m.content}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {dayjs(m.createdAt).format('MM-DD HH:mm')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive"
                      onClick={() => deleteObjMemo.mutate(m.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ))}
                {objMemos?.length === 0 && <p className="py-2 text-sm text-muted-foreground">暂无备忘</p>}
                <div className="flex gap-2 pt-2">
                  <Input
                    value={objMemoContent}
                    placeholder="备忘内容"
                    onChange={(e) => setObjMemoContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && objMemoContent.trim()) {
                        createObjMemo.mutate(objMemoContent.trim());
                      }
                    }}
                  />
                  <Button
                    onClick={() => objMemoContent.trim() && createObjMemo.mutate(objMemoContent.trim())}
                    disabled={createObjMemo.isPending}
                  >
                    {t('common.add')}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* KR 列表 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {t('objective.keyResults')} ({keyResults.length})
          </CardTitle>
          {editable && (
            <Button size="sm" onClick={() => setKrDialog(emptyKrForm())}>
              <Plus />
              {t('objective.addKr')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {keyResults.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('objective.emptyKr')}</p>
              {editable && (
                <Button onClick={() => setKrDialog(emptyKrForm())}>{t('objective.addNow')}</Button>
              )}
            </div>
          ) : (
            <div>
              {keyResults.map((kr) => {
                const conf = CONFIDENCE_META[(kr.confidence ?? 'on_track') as KrConfidence];
                return (
                  <div
                    key={kr.id}
                    className="flex flex-wrap items-center gap-3 border-b py-3 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <span className="shrink-0 text-2xl">{kr.emoji}</span>
                    <div className="min-w-48 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-125"
                          style={{ background: conf.color, boxShadow: '0 0 0 3px rgba(0,0,0,0.06)' }}
                          title={`信心度：${conf.label}（点击切换）`}
                          onClick={() => cycleConfidence.mutate(kr)}
                        />
                        <span className="font-medium">{kr.title}</span>
                        <Badge variant="outline">{CalculationTypeLabel[kr.calculationType as CalculationType]}</Badge>
                        <Badge variant="secondary">权重 {kr.weight}</Badge>
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {kr.initialValue} → {kr.currentValue.toFixed(2)} / {kr.targetValue}
                      </div>
                    </div>
                    <div className="flex w-44 items-center gap-2">
                      <Progress value={Math.round(computeProgress(kr) * 100)} className="h-2.5 flex-1" />
                      <span className="w-9 text-right text-xs tabular-nums">
                        {Math.round(computeProgress(kr) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openRecordDialog(kr)}>
                        + {t('objective.addRecord')}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setTrendKr(kr)}>
                        {t('objective.trend')}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setKrMemoKr(kr)}>
                        备忘
                      </Button>
                      {editable && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openKrEdit(kr)}>
                            {t('common.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive"
                            onClick={() => {
                              if (window.confirm(`确定删除 KR「${kr.title}」吗？`)) deleteKr.mutate(kr.id);
                            }}
                          >
                            {t('common.delete')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 复盘记录 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('review.title')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/reviews')}>
            {t('common.viewAll', { defaultValue: '查看全部' })}
          </Button>
        </CardHeader>
        <CardContent>
          {objective.reviews?.length ? (
            <div>
              {objective.reviews.map((r) => (
                <div key={r.id} className="border-b py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.type === 'final' ? 'success' : 'soft'}>
                      {r.type === 'final' ? t('review.final') : t('review.midterm')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t('review.version')} v{r.version}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      自评 {pct(r.selfRating)}%
                    </span>
                    {r.objectiveScore != null && (
                      <span className="text-xs font-semibold tabular-nums text-primary">
                        目标得分 {r.objectiveScore}
                      </span>
                    )}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {dayjs(r.createdAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  {(r.problems || r.solutions || r.thoughts) && (
                    <div className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                      {r.problems && <p>问题：{r.problems}</p>}
                      {r.solutions && <p>方案：{r.solutions}</p>}
                      {r.thoughts && <p>思考：{r.thoughts}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t('review.empty')}</p>
          )}
        </CardContent>
      </Card>

      {/* 目标编辑 Dialog */}
      <Dialog open={objEditOpen} onOpenChange={setObjEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑目标</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>标题 *</Label>
              <Input
                value={objForm.title}
                placeholder="目标标题"
                onChange={(e) => setObjForm({ ...objForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('goal.color')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                  value={objForm.color}
                  onChange={(e) => setObjForm({ ...objForm, color: e.target.value })}
                />
                <Input
                  className="flex-1"
                  value={objForm.color}
                  onChange={(e) => setObjForm({ ...objForm, color: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={objForm.usePlanTime}
                onCheckedChange={(v) => setObjForm({ ...objForm, usePlanTime: v })}
              />
              <Label>计划时间</Label>
              <span className="text-xs text-muted-foreground">关闭则目标为「未计划」状态</span>
            </div>
            {objForm.usePlanTime && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>开始时间 *</Label>
                  <Input
                    type="datetime-local"
                    value={objForm.startAt}
                    onChange={(e) => setObjForm({ ...objForm, startAt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>结束时间 *</Label>
                  <Input
                    type="datetime-local"
                    value={objForm.endAt}
                    onChange={(e) => setObjForm({ ...objForm, endAt: e.target.value })}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t('objective.motivations')}</Label>
              <TagInput
                items={objForm.motivations}
                onChange={(v) => setObjForm({ ...objForm, motivations: v })}
                placeholder="输入动机后回车添加"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('objective.feasibility')}</Label>
              <TagInput
                items={objForm.feasibilities}
                onChange={(v) => setObjForm({ ...objForm, feasibilities: v })}
                placeholder="输入可行性后回车添加"
                variant="success"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setObjEditOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={submitObjEdit} disabled={updateObjective.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* KR 创建 / 编辑 Dialog */}
      <Dialog open={!!krDialog} onOpenChange={(open) => !open && setKrDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{krDialog?.editId ? '编辑关键结果' : '新建关键结果'}</DialogTitle>
          </DialogHeader>
          {krDialog && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>标题 *</Label>
                <Input
                  autoFocus
                  value={krDialog.title}
                  placeholder="建议含数字与单位"
                  onChange={(e) => setKrDialog({ ...krDialog, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Emoji</Label>
                  <Input
                    className="w-24"
                    value={krDialog.emoji}
                    onChange={(e) => setKrDialog({ ...krDialog, emoji: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>取值方式</Label>
                  <Select
                    value={krDialog.calculationType}
                    onValueChange={(v) => setKrDialog({ ...krDialog, calculationType: v as CalculationType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CalculationTypeLabel).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {krDialog.calculationType === 'custom' && (
                <div className="space-y-1.5">
                  <Label>自定义公式</Label>
                  <Input
                    value={krDialog.customFormula}
                    placeholder="如：records.map(r => r.value).reduce((a,b) => a+b, 0)"
                    onChange={(e) => setKrDialog({ ...krDialog, customFormula: e.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>初始值 *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={krDialog.initialValue}
                    onChange={(e) => setKrDialog({ ...krDialog, initialValue: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>目标值 *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={krDialog.targetValue}
                    onChange={(e) => setKrDialog({ ...krDialog, targetValue: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>权重</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={krDialog.weight}
                    onChange={(e) => setKrDialog({ ...krDialog, weight: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>最少记录数</Label>
                  <Input
                    type="number"
                    min={0}
                    value={krDialog.minRecordCount}
                    onChange={(e) => setKrDialog({ ...krDialog, minRecordCount: Number(e.target.value) })}
                  />
                </div>
              </div>
              {krDialog.editId && (
                <div className="space-y-1.5">
                  <Label>信心度</Label>
                  <RadioGroup
                    className="flex gap-4"
                    value={krDialog.confidence ?? 'on_track'}
                    onValueChange={(v) => setKrDialog({ ...krDialog, confidence: v as KrConfidence })}
                  >
                    {(Object.keys(CONFIDENCE_META) as KrConfidence[]).map((c) => (
                      <Label key={c} className="flex items-center gap-1.5 font-normal">
                        <RadioGroupItem value={c} />
                        {CONFIDENCE_META[c].label}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setKrDialog(null)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={submitKr} disabled={createKr.isPending || updateKr.isPending}>
                  {krDialog.editId ? t('common.save') : t('common.create')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 记录添加 Dialog */}
      <Dialog open={!!recordKr} onOpenChange={(open) => !open && setRecordKr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('objective.addRecord')} - {recordKr?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>数值 *</Label>
              <Input
                type="number"
                step="0.1"
                value={recordForm.value}
                onChange={(e) => setRecordForm({ ...recordForm, value: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={recordForm.note}
                onChange={(e) => setRecordForm({ ...recordForm, note: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecordKr(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => addRecord.mutate()} disabled={addRecord.isPending}>
                {t('common.add')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* 趋势图 Dialog */}
      <Dialog open={!!trendKr} onOpenChange={(open) => !open && setTrendKr(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('objective.trend')} - {trendKr?.title}
            </DialogTitle>
          </DialogHeader>
          {trendData && trendData.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="recordedAt"
                    tickFormatter={(v: string) => dayjs(v).format('MM-DD HH:mm')}
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    labelFormatter={(v) => dayjs(String(v)).format('YYYY-MM-DD HH:mm')}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line name="累计值" type="monotone" dataKey="cumulativeValue" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  <Line name="单次值" type="monotone" dataKey="value" stroke="var(--success)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              <Separator />
              {/* 记录列表 + 记录级备忘 */}
              <div className="max-h-56 overflow-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>时间</TH>
                      <TH>数值</TH>
                      <TH>备注</TH>
                      <TH className="text-right">备忘</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(trendKr?.records ?? []).map((r) => (
                      <TR key={r.id}>
                        <TD className="tabular-nums">{dayjs(r.recordedAt).format('MM-DD HH:mm')}</TD>
                        <TD className="tabular-nums">{r.value}</TD>
                        <TD className="max-w-52 truncate text-muted-foreground">{r.note || '-'}</TD>
                        <TD className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() =>
                              setRecordMemo({
                                id: r.id,
                                title: `${dayjs(r.recordedAt).format('MM-DD HH:mm')} · ${r.value}`,
                              })
                            }
                          >
                            备忘
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">还没有记录数据</p>
          )}
        </DialogContent>
      </Dialog>

      {/* KR 级备忘 */}
      <MemoDialog
        open={!!krMemoKr}
        onOpenChange={(open) => !open && setKrMemoKr(null)}
        ownerType="key_result"
        ownerId={krMemoKr?.id ?? ''}
        title={`KR 备忘 · ${krMemoKr?.title ?? ''}`}
      />

      {/* 记录级备忘 */}
      <MemoDialog
        open={!!recordMemo}
        onOpenChange={(open) => !open && setRecordMemo(null)}
        ownerType="record"
        ownerId={recordMemo?.id ?? ''}
        title={`记录备忘 · ${recordMemo?.title ?? ''}`}
      />
    </div>
  );
}
