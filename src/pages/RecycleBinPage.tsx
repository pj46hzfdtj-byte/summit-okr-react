import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { recycleApi } from '@/lib/api';
import type { RecycleEntityType, RecycleItem } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/controls';
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

type PendingAction =
  | { kind: 'destroy'; item: RecycleItem }
  | { kind: 'empty' }
  | null;

export default function RecycleBinPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: items, isLoading } = useQuery({ queryKey: ['recycle'], queryFn: recycleApi.list });
  const [pending, setPending] = useState<PendingAction>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recycle'] });

  const restoreMutation = useMutation({
    mutationFn: (item: RecycleItem) => recycleApi.restore(item.entityType, item.id),
    onSuccess: () => {
      toast.success(t('recycle.restoreSuccess'));
      invalidate();
    },
  });

  const destroyMutation = useMutation({
    mutationFn: (item: RecycleItem) => recycleApi.destroy(item.entityType, item.id),
    onSuccess: () => {
      toast.success(t('recycle.destroySuccess'));
      setPending(null);
      invalidate();
    },
    onError: () => setPending(null),
  });

  const emptyMutation = useMutation({
    mutationFn: () => recycleApi.empty(),
    onSuccess: (res) => {
      toast.success(t('recycle.emptySuccess', { count: res.count }));
      setPending(null);
      invalidate();
    },
    onError: () => setPending(null),
  });

  const typeLabel: Record<RecycleEntityType, string> = {
    objective: t('recycle.typeObjective'),
    key_result: t('recycle.typeKeyResult'),
    task: t('recycle.typeTask'),
  };

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'destroy') destroyMutation.mutate(pending.item);
    else emptyMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{t('recycle.title')}</h2>
        {!!items?.length && (
          <Button variant="destructive" onClick={() => setPending({ kind: 'empty' })}>
            <Trash2 /> {t('recycle.empty')}
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-primary-soft bg-primary-soft/60 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">{t('recycle.hint')}</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          )}
          {!isLoading && !items?.length && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t('recycle.emptyState')}
            </div>
          )}
          {!!items?.length && (
            <Table>
              <THead>
                <TR>
                  <TH className="w-28 pl-5">{t('recycle.type')}</TH>
                  <TH className="min-w-50">{t('recycle.name')}</TH>
                  <TH className="min-w-40">{t('recycle.meta')}</TH>
                  <TH className="w-40">{t('recycle.deletedAt')}</TH>
                  <TH className="w-40 pr-5 text-right">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((item) => (
                  <TR key={`${item.entityType}-${item.id}`}>
                    <TD className="pl-5">
                      <Badge variant="secondary">{typeLabel[item.entityType]}</Badge>
                    </TD>
                    <TD className="max-w-72 truncate">{item.title}</TD>
                    <TD className="text-[13px] text-muted-foreground">{item.meta || '—'}</TD>
                    <TD className="text-[13px] tabular-nums text-muted-foreground">
                      {dayjs(item.deletedAt).format('YYYY-MM-DD HH:mm')}
                    </TD>
                    <TD className="pr-5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-primary hover:text-primary"
                          disabled={restoreMutation.isPending}
                          onClick={() => restoreMutation.mutate(item)}
                        >
                          <RotateCcw /> {t('recycle.restore')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPending({ kind: 'destroy', item })}
                        >
                          {t('recycle.destroy')}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.notice')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'destroy'
                ? t('recycle.destroyConfirm', { name: pending.item.title })
                : t('recycle.emptyConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmPending}
            >
              {destroyMutation.isPending || emptyMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : null}
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
