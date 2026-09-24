import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/controls';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.username || !form.password) {
      toast.error(t('auth.fillAll'));
      return;
    }
    if (form.password.length < 6 || form.password.length > 50) {
      toast.error(t('auth.passwordRule') || '密码长度 6-50 字符');
      return;
    }
    if (form.password !== form.confirm) {
      toast.error(t('auth.passwordMismatch') || '两次密码不一致');
      return;
    }
    setLoading(true);
    try {
      await register(form.email, form.username, form.password);
      toast.success(t('auth.registerSuccess'));
      navigate('/summary', { replace: true });
    } catch {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[#6c5ce7]/20 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f8dff] via-[#409eff] to-[#6c5ce7] shadow-lg shadow-primary/30">
            <Flag className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('auth.register')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.slogan')}</p>
        </div>

        <form onSubmit={submit} className="glass-surface space-y-4 rounded-2xl p-6 shadow-xl">
          <div className="space-y-1.5">
            <Label htmlFor="r-email">{t('auth.email')}</Label>
            <Input id="r-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-username">{t('auth.username')}</Label>
            <Input id="r-username" value={form.username} onChange={(e) => set('username', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-pwd">{t('auth.password')}</Label>
            <Input id="r-pwd" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-confirm">{t('auth.confirmPassword')}</Label>
            <Input id="r-confirm" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {t('auth.register')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('auth.loginNow')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
