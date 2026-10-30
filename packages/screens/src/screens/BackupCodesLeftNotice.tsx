'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readHandoff, setHandoff } from '../handoff';
import { BackupCodesLeftToast } from '../TwoFactorVerifyView';
import styles from '../auth.module.css';

const AUTO_CLOSE_MS = 8_000; // 3 sau mai multe coduri: toastul neutru se închide singur

/* R-2F10 (S81): o singură dată, unde ajungi după intrarea cu un cod de rezervă. Cu 2 sau mai
   puține coduri rămâne până îl închizi. „Generează coduri noi” → Contul tău · Securitate (Hub)
   sau FounderBackupCodes (Founder, S84). Se montează în layout-ul paginilor de după intrare. */
export function BackupCodesLeftNotice({
  readLeft,
  backupCodesHref,
}: {
  readLeft: () => Promise<number | null>;
  backupCodesHref: string;
}) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!readHandoff().backupCodeUsed) return;
    setHandoff({ backupCodeUsed: false });
    void readLeft().then(setLeft);
  }, [readLeft]);

  useEffect(() => {
    if (left === null || left <= 2) return;
    const id = setTimeout(() => setLeft(null), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [left]);

  if (left === null) return null;
  return (
    <div className={styles.toastSlot}>
      <BackupCodesLeftToast
        left={left}
        onGenerate={() => {
          setLeft(null);
          router.push(backupCodesHref);
        }}
        onDismiss={() => setLeft(null)}
      />
    </div>
  );
}
