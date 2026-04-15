'use client';

import { SurveyList } from '@/components/SurveyList';
import { EnvGuard } from '@/components/EnvGuard';

export default function DashboardPage() {
  return (
    <EnvGuard>
      <h1>Dashboard gerencial</h1>
      <p className="muted">
        Gere QR codes e acompanhe os votos de cada enquete em tempo real.
      </p>
      <SurveyList showDashboardLinks />
    </EnvGuard>
  );
}
