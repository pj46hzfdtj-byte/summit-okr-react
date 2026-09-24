import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-8xl font-bold text-primary">404</h1>
      <p className="text-muted-foreground">页面不存在</p>
      <Button onClick={() => navigate('/', { replace: true })}>返回首页</Button>
    </div>
  );
}
