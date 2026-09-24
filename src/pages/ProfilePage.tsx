import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Loader2, Monitor, Moon, Sun, Upload } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { dataApi, userApi } from '@/lib/api';
import type { ColorMode, NotifPrefs, SupportedLocale, UpdateUserDto } from '@/lib/types';
import { useAuthStore } from '@/stores/auth';
import { useAppStore, type AppTheme } from '@/stores/app';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label, Separator, Switch } from '@/components/ui/controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const COLOR_MODES: { value: ColorMode; labelKey: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'profile.colorModeLight', icon: Sun },
  { value: 'dark', labelKey: 'profile.colorModeDark', icon: Moon },
  { value: 'system', labelKey: 'profile.colorModeSystem', icon: Monitor },
];

// 'dark' 已从配色中移除：深浅外观由「外观」模式统一管理
const THEMES: { value: AppTheme; swatch: string }[] = [
  { value: 'light', swatch: '#64748b' },
  { value: 'blue', swatch: '#3b82f6' },
  { value: 'green', swatch: '#10b981' },
  { value: 'purple', swatch: '#8b5cf6' },
  { value: 'macos', swatch: '#0a84ff' },
];

const LOCALES: SupportedLocale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];

const NOTIF_PREF_KEYS: { key: keyof NotifPrefs; labelKey: string }[] = [
  { key: 'stale_kr', labelKey: 'profile.notifPref.staleKr' },
  { key: 'cycle_ending', labelKey: 'profile.notifPref.cycleEnding' },
  { key: 'review_pending', labelKey: 'profile.notifPref.reviewPending' },
  { key: 'task_overdue', labelKey: 'profile.notifPref.taskOverdue' },
  { key: 'checkin_reminder', labelKey: 'profile.notifPref.checkinReminder' },
];

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  stale_kr: true,
  cycle_ending: true,
  review_pending: true,
  task_overdue: true,
  checkin_reminder: true,
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const theme = useAppStore((s) => s.theme);
  const colorMode = useAppStore((s) => s.colorMode);
  const locale = useAppStore((s) => s.locale);
  const compactMode = useAppStore((s) => s.compactMode);
  const setTheme = useAppStore((s) => s.setTheme);
  const setColorMode = useAppStore((s) => s.setColorMode);
  const setLocale = useAppStore((s) => s.setLocale);
  const setCompactMode = useAppStore((s) => s.setCompactMode);

  // ============ 用户资料 ============
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [birthDate, setBirthDate] = useState(
    user?.birthDate ? dayjs(user.birthDate).format('YYYY-MM-DD') : '',
  );

  const saveMutation = useMutation({
    mutationFn: async (dto: UpdateUserDto) => {
      const updated = await userApi.updateMe(dto);
      setUser(updated);
      return updated;
    },
    onSuccess: () => toast.success(t('common.success')),
  });

  function handleSave() {
    saveMutation.mutate({
      username: username.trim() || undefined,
      bio: bio.trim(),
      birthDate: birthDate || null,
      preferredTheme: theme,
      preferredLocale: locale,
    });
  }

  // ============ 通知偏好 ============
  const { data: settings } = useQuery({
    queryKey: ['user-settings'],
    queryFn: userApi.getSettings,
  });
  const notifPrefs = settings?.notifPrefs ?? DEFAULT_NOTIF_PREFS;

  const notifMutation = useMutation({
    mutationFn: (prefs: NotifPrefs) => userApi.updateSettings({ notifPrefs: prefs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings'] }),
  });

  function toggleNotifPref(key: keyof NotifPrefs, val: boolean) {
    if (notifMutation.isPending) return;
    notifMutation.mutate({ ...notifPrefs, [key]: val });
  }

  // ============ 数据导出/导入 ============
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPayload, setImportPayload] = useState<unknown>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await dataApi.export();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `summit-okr-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('profile.exportData'));
    } catch {
      // 错误已由 http 拦截器 toast
    } finally {
      setExporting(false);
    }
  }

  async function handleFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      setImportPayload(data);
      setImportOpen(true);
    } catch (err) {
      toast.error(`${t('common.failed')}: ${err instanceof Error ? err.message : ''}`);
    }
  }

  const importMutation = useMutation({
    mutationFn: (conflict: 'skip' | 'overwrite') => dataApi.import(importPayload, conflict),
    onSuccess: () => {
      toast.success(t('common.success'));
      setImportOpen(false);
      setImportPayload(null);
      qc.invalidateQueries();
    },
    onError: () => setImportOpen(false),
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h2 className="text-xl font-bold tracking-tight">{t('profile.title')}</h2>

      {/* 个人资料 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.username')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('profile.email')}</Label>
            <Input value={user?.email ?? ''} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{t('profile.username')}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('profile.bio')}</Label>
            <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('profile.birthDate')}</Label>
            <Input
              type="date"
              className="max-w-48"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('profile.birthDatePlaceholder')}</p>
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="animate-spin" />}
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      {/* 外观与主题 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.appearance')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 外观（日间/夜间/跟随系统）——位于主题之上，即时生效 */}
          <div className="flex items-center justify-between gap-4">
            <Label>{t('profile.appearance')}</Label>
            <div className="flex gap-1.5">
              {COLOR_MODES.map(({ value, labelKey, icon: Icon }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={colorMode === value ? 'default' : 'outline'}
                  onClick={() => setColorMode(value)}
                >
                  <Icon /> {t(labelKey)}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          {/* 主题配色（dark 已移除，由外观模式接管） */}
          <div className="flex items-center justify-between gap-4">
            <Label>{t('profile.theme')}</Label>
            <div className="flex gap-1.5">
              {THEMES.map(({ value, swatch }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={theme === value ? 'default' : 'outline'}
                  onClick={() => setTheme(value)}
                >
                  <span
                    className="h-3 w-3 rounded-full border border-white/30"
                    style={{ background: swatch }}
                  />
                  {t(`profile.themeNames.${value}`)}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          {/* 语言：即时生效 */}
          <div className="flex items-center justify-between gap-4">
            <Label>{t('profile.locale')}</Label>
            <Select value={locale} onValueChange={(v) => setLocale(v as SupportedLocale)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {t(`profile.localeNames.${l}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator />
          {/* 紧凑模式 */}
          <div className="flex items-center justify-between gap-4">
            <Label>{t('profile.compactMode')}</Label>
            <Switch checked={compactMode} onCheckedChange={(v) => setCompactMode(!!v)} />
          </div>
        </CardContent>
      </Card>

      {/* 通知偏好 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.notifPrefs')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIF_PREF_KEYS.map(({ key, labelKey }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm">{t(labelKey)}</span>
              <Switch
                checked={!!notifPrefs[key]}
                disabled={notifMutation.isPending}
                onCheckedChange={(v) => toggleNotifPref(key, !!v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 数据管理 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.dataManagement')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {t('profile.exportData')}
            </Button>
            <Button
              variant="outline"
              disabled={importMutation.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload /> {t('profile.importData')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFilePicked}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('profile.exportHint')}</p>
        </CardContent>
      </Card>

      {/* 导入冲突策略 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('profile.importData')}</DialogTitle>
            <DialogDescription>{t('profile.exportHint')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row">
            <Button
              variant="outline"
              disabled={importMutation.isPending}
              onClick={() => importMutation.mutate('skip')}
            >
              {t('common.skip')}
            </Button>
            <Button
              disabled={importMutation.isPending}
              onClick={() => importMutation.mutate('overwrite')}
            >
              {importMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              {t('common.overwrite')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
