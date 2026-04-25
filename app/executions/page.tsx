'use client';

import { ExecutionList } from '@/components/ExecutionList';
import { EnvGuard } from '@/components/EnvGuard';

export default function ExecutionsPage() {
  return (
    <EnvGuard>
      <ExecutionList />
    </EnvGuard>
  );
}
