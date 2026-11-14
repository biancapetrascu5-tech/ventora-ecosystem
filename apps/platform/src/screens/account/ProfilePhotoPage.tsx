'use client';

import { useTranslations } from 'next-intl';
import { ProfilePhotoScreen } from './ProfilePhotoScreen';

/** The role of the switcher preview in the person's language (roles.*), then the screen. */
export function ProfilePhotoPage({
  name,
  photo,
  org,
}: {
  name: string;
  photo: string | null;
  org: { name: string; role: string; logo?: string } | null;
}) {
  const roles = useTranslations('roles');
  return (
    <ProfilePhotoScreen
      data={{
        name,
        photo,
        org: org ? { ...org, role: roles.has(org.role) ? roles(org.role) : org.role } : null,
      }}
    />
  );
}
