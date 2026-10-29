'use client';

interface ShellProps {
  title?: string;
  children: React.ReactNode;
}

export function GalleryShell({ children }: ShellProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--sheet)', color: 'var(--ink)' }}>
      {children}
    </div>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
  column?: boolean;
}

export function GallerySection({ label, children, column }: SectionProps) {
  return (
    <section>
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--ink-muted)',
          marginBottom: '0.75rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: column ? 'column' : 'row',
          flexWrap: column ? undefined : 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-start',
        }}
      >
        {children}
      </div>
    </section>
  );
}
