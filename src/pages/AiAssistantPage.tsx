import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi, goalGroupApi, keyResultApi, objectiveApi, taskApi } from '@/lib/api';
import type {
  AiPlanGoalResult,
  AiPlanTaskResult,
  AiSuggestScoreResult,
} from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/controls';
import { Separator } from '@/components/ui/controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalculationTypeLabel } from '@/lib/types';

type TabValue = 'plan-goal' | 'plan-tasks' | 'suggest-score' | 'suggest-motivations';

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // 来自目标详情页的快捷跳转
  const initialTab = (searchParams.get('tab') as TabValue) || 'plan-goal';
  const queryObjectiveId = searchParams.get('objectiveId') || '';

  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  // ============ 用量配额 ============
  const { data: usage } = useQuery({ queryKey: ['ai-usage'], queryFn: aiApi.getUsage });
  const usagePercent = usage ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const refreshUsage = () => qc.invalidateQueries({ queryKey: ['ai-usage'] });

  // ============ 共享数据 ============
  const { data: objectives = [] } = useQuery({
    queryKey: ['objectives-all'],
    queryFn: async () => (await objectiveApi.list({ page: 1, pageSize: 100 })).list,
  });
  const { data: goalGroups = [] } = useQuery({
    queryKey: ['goal-groups-tree'],
    queryFn: () => goalGroupApi.getTree(),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['objectives-all'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
    qc.invalidateQueries({ queryKey: ['gantt'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['reviews'] });
  };

  // ============ 规划目标 ============
  const [planGoalInput, setPlanGoalInput] = useState('');
  const [planGoalContext, setPlanGoalContext] = useState('');
  const [planGoalGroup, setPlanGoalGroup] = useState('');
  const [planGoalResult, setPlanGoalResult] = useState<AiPlanGoalResult | null>(null);
  const [planGoalCheckedKrs, setPlanGoalCheckedKrs] = useState<Set<number>>(new Set());

  const planGoalMutation = useMutation({
    mutationFn: () =>
      aiApi.planGoal({
        goal: planGoalInput.trim(),
        context: planGoalContext.trim() || undefined,
      }),
    onSuccess: (res) => {
      setPlanGoalResult(res);
      setPlanGoalCheckedKrs(new Set(res.keyResults.map((_, i) => i)));
      refreshUsage();
    },
  });

  const runPlanGoal = () => {
    if (!planGoalInput.trim()) {
      toast.warning(t('ai.inputGoal'));
      return;
    }
    setPlanGoalResult(null);
    planGoalMutation.mutate();
  };

  const applyGoalMutation = useMutation({
    mutationFn: async () => {
      const krs = planGoalResult!.keyResults.filter((_, i) => planGoalCheckedKrs.has(i));
      const obj = await objectiveApi.create({
        goalGroupId: planGoalGroup,
        title: planGoalResult!.objective.title,
        motivations: planGoalResult!.objective.motivations,
        feasibilities: planGoalResult!.objective.feasibilities,
      });
      for (const kr of krs) {
        await keyResultApi.create({
          objectiveId: obj.id,
          title: kr.title,
          initialValue: kr.initialValue,
          targetValue: kr.targetValue,
          calculationType: kr.calculationType,
          emoji: kr.emoji,
          weight: kr.weight,
        });
      }
    },
    onSuccess: () => {
      toast.success(t('ai.applySuccess'));
      setPlanGoalResult(null);
      setPlanGoalInput('');
      invalidateAll();
    },
  });

  const applyPlanGoal = () => {
    if (!planGoalResult) return;
    if (!planGoalGroup) {
      toast.warning(t('ai.selectGroup'));
      return;
    }
    const krs = planGoalResult.keyResults.filter((_, i) => planGoalCheckedKrs.has(i));
    if (!krs.length) {
      toast.warning(t('ai.selectKr'));
      return;
    }
    applyGoalMutation.mutate();
  };

  const toggleKr = (i: number) => {
    const s = new Set(planGoalCheckedKrs);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setPlanGoalCheckedKrs(s);
  };

  // ============ 拆解任务 ============
  const [planTaskObjective, setPlanTaskObjective] = useState(queryObjectiveId);
  const [planTaskContext, setPlanTaskContext] = useState('');
  const [planTaskResult, setPlanTaskResult] = useState<AiPlanTaskResult | null>(null);
  const [planTaskChecked, setPlanTaskChecked] = useState<Set<number>>(new Set());

  const planTasksMutation = useMutation({
    mutationFn: () =>
      aiApi.planTasks({
        objectiveId: planTaskObjective || undefined,
        context: planTaskContext.trim() || undefined,
      }),
    onSuccess: (res) => {
      setPlanTaskResult(res);
      setPlanTaskChecked(new Set(res.tasks.map((_, i) => i)));
      refreshUsage();
    },
  });

  const runPlanTasks = () => {
    if (!planTaskObjective && !planTaskContext.trim()) {
      toast.warning(t('ai.selectObjective'));
      return;
    }
    setPlanTaskResult(null);
    planTasksMutation.mutate();
  };

  const applyTasksMutation = useMutation({
    mutationFn: async () => {
      const tasks = planTaskResult!.tasks.filter((_, i) => planTaskChecked.has(i));
      for (const tk of tasks) {
        await taskApi.create({
          objectiveId: planTaskObjective || null,
          title: tk.title,
          description: tk.description,
          scheduledAt: tk.scheduledAt,
          repeatRule: tk.repeatRule,
          contribution: tk.contribution,
        });
      }
    },
    onSuccess: () => {
      toast.success(t('ai.applySuccess'));
      setPlanTaskResult(null);
      setPlanTaskContext('');
      invalidateAll();
    },
  });

  const applyPlanTasks = () => {
    if (!planTaskResult) return;
    const tasks = planTaskResult.tasks.filter((_, i) => planTaskChecked.has(i));
    if (!tasks.length) {
      toast.warning(t('ai.selectTask'));
      return;
    }
    applyTasksMutation.mutate();
  };

  const toggleTask = (i: number) => {
    const s = new Set(planTaskChecked);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setPlanTaskChecked(s);
  };

  // ============ 复盘评分 ============
  const [scoreObjective, setScoreObjective] = useState(queryObjectiveId);
  const [scoreResult, setScoreResult] = useState<AiSuggestScoreResult | null>(null);

  const suggestScoreMutation = useMutation({
    mutationFn: () => aiApi.suggestScore(scoreObjective),
    onSuccess: (res) => {
      setScoreResult(res);
      refreshUsage();
    },
  });

  const runSuggestScore = () => {
    if (!scoreObjective) {
      toast.warning(t('ai.selectObjective'));
      return;
    }
    setScoreResult(null);
    suggestScoreMutation.mutate();
  };

  // 评分结果中的 KR 标题映射
  const { data: scoreKrs = [] } = useQuery({
    queryKey: ['objective-krs', scoreObjective],
    queryFn: () => keyResultApi.listByObjective(scoreObjective),
    enabled: !!scoreObjective && !!scoreResult,
  });

  // ============ 动机建议 ============
  const [motivationTitle, setMotivationTitle] = useState('');
  const [motivationContext, setMotivationContext] = useState('');
  const [motivationResult, setMotivationResult] = useState<string[]>([]);
  const [motivationChecked, setMotivationChecked] = useState<Set<number>>(new Set());
  const [motivationObjective, setMotivationObjective] = useState(queryObjectiveId);

  const motivationsMutation = useMutation({
    mutationFn: () =>
      aiApi.suggestMotivations({
        objectiveTitle: motivationTitle.trim(),
        context: motivationContext.trim() || undefined,
      }),
    onSuccess: (res) => {
      setMotivationResult(res.motivations);
      setMotivationChecked(new Set(res.motivations.map((_, i) => i)));
      refreshUsage();
    },
  });

  const runMotivations = () => {
    if (!motivationTitle.trim()) {
      toast.warning(t('ai.inputTitle'));
      return;
    }
    setMotivationResult([]);
    motivationsMutation.mutate();
  };

  const toggleMotivation = (i: number) => {
    const s = new Set(motivationChecked);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setMotivationChecked(s);
  };

  const applyMotivationsMutation = useMutation({
    mutationFn: async () => {
      const picked = motivationResult.filter((_, i) => motivationChecked.has(i));
      const obj = objectives.find((o) => o.id === motivationObjective);
      const merged = Array.from(new Set([...(obj?.motivations ?? []), ...picked]));
      await objectiveApi.update(motivationObjective, { motivations: merged });
    },
    onSuccess: () => {
      toast.success(t('ai.applySuccess'));
      setMotivationResult([]);
      setMotivationTitle('');
      invalidateAll();
    },
  });

  const applyMotivations = () => {
    if (!motivationObjective) {
      toast.warning(t('ai.selectObjective'));
      return;
    }
    const picked = motivationResult.filter((_, i) => motivationChecked.has(i));
    if (!picked.length) {
      toast.warning(t('ai.selectMotivation'));
      return;
    }
    applyMotivationsMutation.mutate();
  };

  // 切换 tab 时清理旧结果
  useEffect(() => {
    setPlanGoalResult(null);
    setPlanTaskResult(null);
    setScoreResult(null);
    setMotivationResult([]);
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" /> {t('nav.ai')}
        </h2>
        {usage && (
          <Badge variant="secondary">
            {t('ai.usage')}: {usage.used}/{usage.limit}
          </Badge>
        )}
      </div>
      {usage && (
        <Progress
          value={usagePercent}
          indicatorClassName={usagePercent >= 100 ? 'bg-destructive' : 'bg-success'}
        />
      )}

      <Card>
        <CardContent className="p-5">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
            <TabsList>
              <TabsTrigger value="plan-goal">{t('ai.planGoal')}</TabsTrigger>
              <TabsTrigger value="plan-tasks">{t('ai.planTasks')}</TabsTrigger>
              <TabsTrigger value="suggest-score">{t('ai.suggestScore')}</TabsTrigger>
              <TabsTrigger value="suggest-motivations">{t('ai.suggestMotivations')}</TabsTrigger>
            </TabsList>

            {/* ============ 规划目标 ============ */}
            <TabsContent value="plan-goal" className="max-w-[680px]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.bigGoal')}</Label>
                  <Input
                    placeholder={t('ai.bigGoalPlaceholder')}
                    value={planGoalInput}
                    onChange={(e) => setPlanGoalInput(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.context')}</Label>
                  <Textarea
                    rows={2}
                    placeholder={t('ai.contextPlaceholder')}
                    value={planGoalContext}
                    onChange={(e) => setPlanGoalContext(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.goalGroup')}</Label>
                  <Select value={planGoalGroup} onValueChange={setPlanGoalGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('ai.selectGroup')} />
                    </SelectTrigger>
                    <SelectContent>
                      {goalGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button onClick={runPlanGoal} disabled={planGoalMutation.isPending}>
                    {planGoalMutation.isPending && <Loader2 className="animate-spin" />}
                    {t('ai.run')}
                  </Button>
                </div>
              </div>

              {planGoalResult && (
                <div className="mt-2">
                  <Separator className="my-4" />
                  <h3 className="text-base font-semibold">{planGoalResult.objective.title}</h3>
                  {(planGoalResult.objective.motivations?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {planGoalResult.objective.motivations?.map((m, i) => (
                        <Badge key={i} variant="success">
                          <Check className="h-3 w-3" /> {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <h4 className="mb-2 mt-4 text-sm font-semibold">{t('ai.keyResults')}</h4>
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-10" />
                        <TH>{t('ai.krTitle')}</TH>
                        <TH className="w-28">{t('ai.krRange')}</TH>
                        <TH className="w-24">{t('ai.calcType')}</TH>
                        <TH className="w-16">{t('ai.weight')}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {planGoalResult.keyResults.map((kr, i) => (
                        <TR key={i}>
                          <TD>
                            <Checkbox checked={planGoalCheckedKrs.has(i)} onCheckedChange={() => toggleKr(i)} />
                          </TD>
                          <TD>{kr.emoji ? `${kr.emoji} ${kr.title}` : kr.title}</TD>
                          <TD className="tabular-nums">
                            {kr.initialValue} → {kr.targetValue}
                          </TD>
                          <TD>{CalculationTypeLabel[kr.calculationType] ?? kr.calculationType}</TD>
                          <TD className="tabular-nums">{kr.weight ?? '-'}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <Button
                    className="mt-3 bg-success text-white hover:bg-success/90"
                    onClick={applyPlanGoal}
                    disabled={applyGoalMutation.isPending}
                  >
                    {applyGoalMutation.isPending && <Loader2 className="animate-spin" />}
                    {t('ai.apply')}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ============ 拆解任务 ============ */}
            <TabsContent value="plan-tasks" className="max-w-[680px]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.objective')}</Label>
                  <Select value={planTaskObjective} onValueChange={setPlanTaskObjective}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('ai.selectObjective')} />
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
                  <Label>{t('ai.context')}</Label>
                  <Textarea
                    rows={2}
                    placeholder={t('ai.contextPlaceholder')}
                    value={planTaskContext}
                    onChange={(e) => setPlanTaskContext(e.target.value)}
                  />
                </div>
                <div>
                  <Button onClick={runPlanTasks} disabled={planTasksMutation.isPending}>
                    {planTasksMutation.isPending && <Loader2 className="animate-spin" />}
                    {t('ai.run')}
                  </Button>
                </div>
              </div>

              {planTaskResult && (
                <div className="mt-2">
                  <Separator className="my-4" />
                  <h4 className="mb-2 text-sm font-semibold">{t('ai.taskList')}</h4>
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-10" />
                        <TH>{t('ai.taskTitle')}</TH>
                        <TH>{t('ai.taskDesc')}</TH>
                        <TH className="w-36">{t('ai.contribution')}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {planTaskResult.tasks.map((tk, i) => (
                        <TR key={i}>
                          <TD>
                            <Checkbox checked={planTaskChecked.has(i)} onCheckedChange={() => toggleTask(i)} />
                          </TD>
                          <TD>{tk.title}</TD>
                          <TD className="text-muted-foreground">{tk.description}</TD>
                          <TD className="text-muted-foreground">{tk.contribution}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <Button
                    className="mt-3 bg-success text-white hover:bg-success/90"
                    onClick={applyPlanTasks}
                    disabled={applyTasksMutation.isPending}
                  >
                    {applyTasksMutation.isPending && <Loader2 className="animate-spin" />}
                    {t('ai.apply')}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ============ 复盘评分 ============ */}
            <TabsContent value="suggest-score" className="max-w-[680px]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.objective')}</Label>
                  <Select value={scoreObjective} onValueChange={setScoreObjective}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('ai.selectObjective')} />
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
                <div>
                  <Button onClick={runSuggestScore} disabled={suggestScoreMutation.isPending}>
                    {suggestScoreMutation.isPending && <Loader2 className="animate-spin" />}
                    {t('ai.run')}
                  </Button>
                </div>
              </div>

              {scoreResult && (
                <div className="mt-2">
                  <Separator className="my-4" />
                  <div className="rounded-lg border border-primary/20 bg-primary-soft p-3 text-sm">
                    Self Rating: <span className="font-bold tabular-nums">{(scoreResult.selfRating * 100).toFixed(0)}%</span>
                  </div>
                  {scoreResult.reasoning && (
                    <p className="my-3 text-sm leading-relaxed text-muted-foreground">{scoreResult.reasoning}</p>
                  )}
                  <Table className="mt-3">
                    <THead>
                      <TR>
                        <TH>{t('ai.krTitle')}</TH>
                        <TH className="w-36">{t('ai.score')}</TH>
                        <TH>{t('ai.note')}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {scoreResult.krScores.map((row) => (
                        <TR key={row.keyResultId}>
                          <TD>{scoreKrs.find((k) => k.id === row.keyResultId)?.title ?? row.keyResultId}</TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <Progress value={Math.round(row.score * 100)} className="h-3 flex-1" />
                              <span className="w-8 text-right text-xs tabular-nums">{Math.round(row.score * 100)}</span>
                            </div>
                          </TD>
                          <TD className="text-muted-foreground">{row.note}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ============ 动机建议 ============ */}
            <TabsContent value="suggest-motivations" className="max-w-[680px]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.objectiveTitle')}</Label>
                  <Input
                    placeholder={t('ai.inputTitle')}
                    value={motivationTitle}
                    onChange={(e) => setMotivationTitle(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('ai.context')}</Label>
                  <Textarea
                    rows={2}
                    placeholder={t('ai.contextPlaceholder')}
                    value={motivationContext}
                    onChange={(e) => setMotivationContext(e.target.value)}
                  />
                </div>
                <div>
                  <Button onClick={runMotivations} disabled={motivationsMutation.isPending}>
                    {motivationsMutation.isPending && <Loader2 className="animate-spin" />}
                    {t('ai.run')}
                  </Button>
                </div>
              </div>

              {motivationResult.length > 0 && (
                <div className="mt-2">
                  <Separator className="my-4" />
                  <div className="flex flex-col gap-2">
                    {motivationResult.map((m, i) => (
                      <label
                        key={i}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60"
                      >
                        <Checkbox checked={motivationChecked.has(i)} onCheckedChange={() => toggleMotivation(i)} />
                        <span>{m}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex max-w-[680px] flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t('ai.applyTo')}</Label>
                      <Select value={motivationObjective} onValueChange={setMotivationObjective}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('ai.selectObjective')} />
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
                    <div>
                      <Button
                        className="bg-success text-white hover:bg-success/90"
                        onClick={applyMotivations}
                        disabled={applyMotivationsMutation.isPending}
                      >
                        {applyMotivationsMutation.isPending && <Loader2 className="animate-spin" />}
                        {t('ai.apply')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
