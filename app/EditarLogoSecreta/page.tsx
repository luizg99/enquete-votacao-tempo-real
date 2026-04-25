'use client';

import { LogoEditor } from '@/components/LogoEditor';
import { EnvGuard } from '@/components/EnvGuard';

export default function EditarLogoSecretaPage() {
  return (
    <EnvGuard>
      <LogoEditor />
    </EnvGuard>
  );
}
