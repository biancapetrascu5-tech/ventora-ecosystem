'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NewBusinessView, emailProblem, type NewBusinessState } from '@ventora/screens';
import { createBusiness } from '@/server/business-actions';
import { FounderShell } from '../shell/FounderShell';

/* „Afacere nouă” (Lot 2.8): createBusinessAsFounder — afacerea și invitația proprietarului (E-4),
   cu auditul E20 pe persoana Founder; apoi pagina afacerii. Erorile de adresă folosesc textele
   existente (auth.reset.error.*). */
export function NewBusinessScreen({ user }: { user: { name: string } }) {
  const router = useRouter();
  const t = useTranslations('founder.newBusiness');
  const reset = useTranslations('auth.reset');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<'empty' | 'format' | null>(null);
  const [state, setState] = useState<NewBusinessState>('idle');

  async function submit() {
    const p = emailProblem(email);
    setProblem(p);
    if (p || !name.trim()) return;
    setState('pending');
    const res = await createBusiness(name.trim(), email.trim());
    if (res.ok) {
      router.push(`/businesses/${res.organizationId}`);
      return;
    }
    if (res.field === 'email') {
      setProblem('format');
      setState('idle');
    } else setState('error');
  }

  return (
    <FounderShell active="afaceri" title={t('title')} user={user}>
      <NewBusinessView
        name={name}
        email={email}
        emailError={problem ? reset(`error.${problem}`) : undefined}
        state={state}
        onNameChange={setName}
        onEmailChange={(v) => {
          setEmail(v);
          if (problem) setProblem(null);
        }}
        onCancel={() => router.push('/businesses')}
        onSubmit={() => void submit()}
      />
    </FounderShell>
  );
}
