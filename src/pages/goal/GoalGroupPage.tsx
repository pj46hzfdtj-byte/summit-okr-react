import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { goalGroupApi, objectiveApi, visionApi } from '@/lib/api';
import type { GoalGroup } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label, Skeleton, Switch } from '@/components/ui/controls';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE_VISION = '__none__';

interface NodeDialogState {
  editingId: string | null;
  parentId: string | null;
  name: string;
  color: string;
  visionId: string | null;
}

interface ObjDialogState {
  goalGroupId: string;
  goalGroupName: string;
}

/** 动机 / 可行性 标签输入 */
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
                className="rounded-full p-0.5 hover:bg-black/10"
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

export default function GoalGroupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: tree, isLoading } = useQuery({
    queryKey: ['goal-group-tree'],
    queryFn: () => goalGroupApi.getTree(true),
  });
  const { data: visions } = useQuery({ queryKey: ['visions'], queryFn: visionApi.list });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ============ 节点 CRUD ============
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoalGroup | null>(null);

  const saveNode = useMutation({
    mutationFn: (v: NodeDialogState) =>
      v.editingId
        ? goalGroupApi.update(v.editingId, { name: v.name, color: v.color, visionId: v.visionId })
        : goalGroupApi.create({
            parentId: v.parentId,
            name: v.name,
            color: v.color,
            visionId: v.parentId ? null : v.visionId,
          }),
    onSuccess: (_d, v) => {
      toast.success(v.editingId ? '更新成功' : '创建成功');
      setNodeDialog(null);
      qc.invalidateQueries({ queryKey: ['goal-group-tree'] });
    },
  });

  const deleteNode = useMutation({
    mutationFn: (id: string) => goalGroupApi.remove(id),
    onSuccess: () => {
      toast.success('删除成功');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['goal-group-tree'] });
    },
  });

  function submitNode() {
    if (!nodeDialog) return;
    if (!nodeDialog.name.trim()) {
      toast.warning('请输入节点名称');
      return;
    }
    saveNode.mutate({ ...nodeDialog, name: nodeDialog.name.trim() });
  }

  // ============ 目标快速创建 ============
  const [objDialog, setObjDialog] = useState<ObjDialogState | null>(null);
  const [objForm, setObjForm] = useState({
    title: '',
    color: '#409EFF',
    usePlanTime: false,
    startAt: '',
    endAt: '',
    motivations: [] as string[],
    feasibilities: [] as string[],
  });

  function openCreateObjective(node: GoalGroup) {
    setObjForm({
      title: '',
      color: '#409EFF',
      usePlanTime: false,
      startAt: '',
      endAt: '',
      motivations: [],
      feasibilities: [],
    });
    setObjDialog({ goalGroupId: node.id, goalGroupName: node.name });
  }

  const createObjective = useMutation({
    mutationFn: objectiveApi.create,
    onSuccess: (obj) => {
      toast.success('目标创建成功');
      setObjDialog(null);
      qc.invalidateQueries({ queryKey: ['goal-group-tree'] });
      navigate(`/objectives/${obj.id}`);
    },
  });

  function submitObjective() {
    if (!objDialog) return;
    if (!objForm.title.trim()) {
      toast.warning('请输入目标标题');
      return;
    }
    if (objForm.usePlanTime) {
      if (!objForm.startAt || !objForm.endAt) {
        toast.warning('开启计划时间后需填写开始与结束时间');
        return;
      }
      if (dayjs(objForm.endAt).isBefore(dayjs(objForm.startAt))) {
        toast.warning('结束时间需晚于开始时间');
        return;
      }
    }
    createObjective.mutate({
      goalGroupId: objDialog.goalGroupId,
      title: objForm.title.trim(),
      color: objForm.color,
      startAt: objForm.usePlanTime && objForm.startAt ? dayjs(objForm.startAt).toISOString() : undefined,
      endAt: objForm.usePlanTime && objForm.endAt ? dayjs(objForm.endAt).toISOString() : undefined,
      motivations: objForm.motivations,
      feasibilities: objForm.feasibilities,
    });
  }

  // ============ 树渲染 ============
  function renderGroup(node: GoalGroup) {
    const hasKids = (node.children?.length ?? 0) > 0 || (node.objectives?.length ?? 0) > 0;
    const isCollapsed = collapsed.has(node.id);
    const isRoot = !node.parentId;
    return (
      <div key={node.id}>
        <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60">
          {hasKids ? (
            <button
              type="button"
              className="shrink-0 text-muted-foreground"
              onClick={() => toggle(node.id)}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: node.color }} />
          <span
            className={isRoot ? 'font-semibold' : 'font-medium'}
            onClick={() => node.objectives?.length && navigate(`/objectives/${node.objectives[0].id}`)}
          >
            {node.name}
          </span>
          {node.vision && (
            <Badge variant="warning" className="max-w-56 truncate">
              {t('vision.rootTag')}·{node.vision.content.slice(0, 12)}
            </Badge>
          )}
          {(node.objectives?.length ?? 0) > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {node.objectives!.length}
            </span>
          )}
          <div className="ml-auto hidden items-center gap-1 group-hover:flex">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() =>
                setNodeDialog({ editingId: null, parentId: node.id, name: '', color: '#1E40AF', visionId: null })
              }
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t('goal.createChild')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => openCreateObjective(node)}
            >
              <FileText className="h-3.5 w-3.5" />
              {t('goal.createObjective')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() =>
                setNodeDialog({
                  editingId: node.id,
                  parentId: node.parentId,
                  name: node.name,
                  color: node.color,
                  visionId: node.visionId ?? null,
                })
              }
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => setDeleteTarget(node)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {!isCollapsed && hasKids && (
          <div className="ml-4 space-y-0 border-l pl-3">
            {node.children?.map(renderGroup)}
            {node.objectives?.map((o) => (
              <div
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60"
                onClick={() => navigate(`/objectives/${o.id}`)}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />
                <span className="text-sm">{o.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const empty = !isLoading && (!tree || tree.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{t('goal.title')}</h2>
        <Button
          onClick={() =>
            setNodeDialog({ editingId: null, parentId: null, name: '', color: '#1E40AF', visionId: null })
          }
        >
          <Plus />
          {t('goal.createRoot')}
        </Button>
      </div>

      <Card>
        <CardContent className="min-h-52 p-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-2/5" />
            </div>
          )}
          {empty && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('goal.emptyHint')}</p>
              <Button
                onClick={() =>
                  setNodeDialog({ editingId: null, parentId: null, name: '', color: '#1E40AF', visionId: null })
                }
              >
                <Plus />
                {t('common.create')}
              </Button>
            </div>
          )}
          {tree && tree.length > 0 && <div className="space-y-0.5">{tree.map(renderGroup)}</div>}
        </CardContent>
      </Card>

      {/* 节点编辑 Dialog */}
      <Dialog open={!!nodeDialog} onOpenChange={(open) => !open && setNodeDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{nodeDialog?.editingId ? t('goal.editNode') : t('goal.createNode')}</DialogTitle>
          </DialogHeader>
          {nodeDialog && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('goal.name')} *</Label>
                <Input
                  autoFocus
                  value={nodeDialog.name}
                  placeholder="如：技术提升"
                  onChange={(e) => setNodeDialog({ ...nodeDialog, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submitNode()}
                />
              </div>
              {!nodeDialog.parentId && (
                <div className="space-y-1.5">
                  <Label>{t('vision.fieldLabel')}</Label>
                  <Select
                    value={nodeDialog.visionId ?? NONE_VISION}
                    onValueChange={(v) =>
                      setNodeDialog({ ...nodeDialog, visionId: v === NONE_VISION ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('vision.fieldPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VISION}>{t('vision.fieldPlaceholder')}</SelectItem>
                      {visions?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.content}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t('goal.color')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                    value={nodeDialog.color}
                    onChange={(e) => setNodeDialog({ ...nodeDialog, color: e.target.value })}
                  />
                  <Input
                    className="flex-1"
                    value={nodeDialog.color}
                    onChange={(e) => setNodeDialog({ ...nodeDialog, color: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNodeDialog(null)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={submitNode} disabled={saveNode.isPending}>
                  {t('common.confirm')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">危险操作</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && t('goal.deleteConfirm', { name: deleteTarget.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteNode.mutate(deleteTarget.id)}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 目标快速创建 Dialog */}
      <Dialog open={!!objDialog} onOpenChange={(open) => !open && setObjDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('goal.createObjective')} · {objDialog?.goalGroupName}
            </DialogTitle>
          </DialogHeader>
          {objDialog && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>标题 *</Label>
                <Input
                  autoFocus
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
                <Label>动机</Label>
                <TagInput
                  items={objForm.motivations}
                  onChange={(v) => setObjForm({ ...objForm, motivations: v })}
                  placeholder="输入动机后回车添加"
                />
              </div>
              <div className="space-y-1.5">
                <Label>可行性</Label>
                <TagInput
                  items={objForm.feasibilities}
                  onChange={(v) => setObjForm({ ...objForm, feasibilities: v })}
                  placeholder="输入可行性后回车添加"
                  variant="success"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setObjDialog(null)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={submitObjective} disabled={createObjective.isPending}>
                  {t('common.create')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
