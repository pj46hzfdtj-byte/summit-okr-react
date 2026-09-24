import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { feedbackApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label, Separator } from '@/components/ui/controls';

type FeedbackType = 'bug' | 'suggestion' | 'other';

const FEEDBACK_TYPES: FeedbackType[] = ['bug', 'suggestion', 'other'];

export default function HelpPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [type, setType] = useState<FeedbackType>('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');

  const { data: history } = useQuery({ queryKey: ['feedback'], queryFn: feedbackApi.list });

  const submitMutation = useMutation({
    mutationFn: () =>
      feedbackApi.create({
        type,
        content: content.trim(),
        contact: contact.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t('help.submitSuccess'));
      setContent('');
      setContact('');
      qc.invalidateQueries({ queryKey: ['feedback'] });
    },
  });

  function handleSubmit() {
    if (content.trim().length < 10) {
      toast.warning(t('help.submitEmpty'));
      return;
    }
    submitMutation.mutate();
  }

  const stats = [
    { num: '10+', label: t('help.statModules') },
    { num: '50+', label: t('help.statApis') },
    { num: '4', label: t('help.statLanguages') },
    { num: 'AI', label: t('help.statAI') },
  ];

  const flow = [t('help.flow1'), t('help.flow2'), t('help.flow3'), t('help.flow4'), t('help.flow5')];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{t('help.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('help.subtitle')}</p>
      </div>

      {/* 关于本项目 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.aboutTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-7 text-muted-foreground">{t('help.aboutIntro')}</p>
          <div className="flex flex-wrap gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-extrabold tabular-nums text-primary">{s.num}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-3">
            {flow.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <span className="whitespace-nowrap rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">
                  {step}
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 快速上手 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.quickStart')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                  {t(`help.qs${i}`)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 功能总览 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.features')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
              <div key={i} className="rounded-lg bg-muted/60 p-3">
                <div className="text-sm font-semibold">{t(`help.f${i}.name`)}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {t(`help.f${i}.desc`)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 常见问题 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.faq')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((i) => (
            <details key={i} className="group rounded-lg border px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {t(`help.faq${i}Q`)}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`help.faq${i}A`)}
              </p>
            </details>
          ))}
        </CardContent>
      </Card>

      {/* 意见反馈 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.feedback')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('help.feedbackType')}</Label>
            <div className="flex gap-1.5">
              {FEEDBACK_TYPES.map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={type === v ? 'default' : 'outline'}
                  onClick={() => setType(v)}
                >
                  {t(`help.types.${v}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('help.content')}</Label>
            <Textarea
              rows={5}
              maxLength={1000}
              placeholder={t('help.contentPlaceholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('help.contact')}</Label>
            <Input
              className="max-w-80"
              placeholder={t('help.contactPlaceholder')}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
            {submitMutation.isPending && <Loader2 className="animate-spin" />}
            {t('help.submit')}
          </Button>

          {!!history?.length && (
            <div className="space-y-3">
              <Separator />
              <h4 className="text-sm font-semibold">{t('help.feedbackHistory')}</h4>
              <ol className="relative space-y-4 border-l pl-5">
                {history.map((item) => (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[25.5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex items-center gap-2">
                      <Badge variant={item.status === 'resolved' ? 'success' : 'secondary'}>
                        {t(`help.types.${item.type}`)}
                      </Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                      {item.content}
                    </p>
                    {item.contact && (
                      <span className="text-xs text-muted-foreground">{item.contact}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
