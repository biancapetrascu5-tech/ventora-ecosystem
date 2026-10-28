/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import {
  Tabs,
  Pagination,
  Menu,
  Tooltip,
  DialogTrigger,
  Dialog,
  DrawerTrigger,
  Drawer,
  CommandPalette,
  Sheet,
  SheetSection,
  PageHeader,
  ContextBar,
  Spine,
  AppShell,
  Button,
  IconButton,
  type NavItem,
  type CommandDef,
} from '@ventora/ui';
import styles from './design.module.css';
import { CONTEXTBAR_RO, PAGINATION_RO, SPINE_RO } from './demo/gallery/_shared/labels';

export function DesignLot3Client() {
  const [paginaActiva, setPaginaActiva] = useState(1);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [spineCollapsed, setSpineCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'clients', label: 'Clienți', icon: 'users', badge: 3 },
    { id: 'appointments', label: 'Programări', icon: 'calendar' },
    { id: 'settings', label: 'Setări', icon: 'settings' },
  ];

  const commands: CommandDef[] = [
    {
      id: 'new-client',
      label: 'Client nou',
      icon: 'user-plus',
      group: 'Acțiuni',
      onSelect: () => {},
    },
    {
      id: 'new-appt',
      label: 'Programare nouă',
      icon: 'calendar-plus',
      group: 'Acțiuni',
      onSelect: () => {},
    },
    { id: 'search', label: 'Caută în tot', icon: 'search', group: 'Navigare', onSelect: () => {} },
    { id: 'settings', label: 'Setări', icon: 'settings', group: 'Navigare', onSelect: () => {} },
    { id: 'help', label: 'Ajutor', icon: 'help-circle', group: 'Navigare', onSelect: () => {} },
  ];

  return (
    <>
      <Section title="Tabs">
        <Tabs
          items={[
            { id: 'detalii', label: 'Detalii', children: <p>Conținut tab Detalii</p> },
            { id: 'istoric', label: 'Istoric', children: <p>Conținut tab Istoric</p> },
            { id: 'documente', label: 'Documente', children: <p>Conținut tab Documente</p> },
            { id: 'dezactivat', label: 'Dezactivat', children: <p>-</p>, isDisabled: true },
          ]}
        />
        <Tabs
          fullWidth
          items={[
            { id: 'zi', label: 'Zi', children: <p>Vedere pe zi</p> },
            { id: 'saptamana', label: 'Săptămână', children: <p>Vedere pe săptămână</p> },
            { id: 'luna', label: 'Lună', children: <p>Vedere pe lună</p> },
          ]}
        />
      </Section>

      <Section title="Pagination">
        <Pagination
          page={paginaActiva}
          pageSize={20}
          total={100}
          onPageChange={setPaginaActiva}
          labels={PAGINATION_RO}
        />
        <Pagination
          page={5}
          pageSize={20}
          total={400}
          onPageChange={() => {}}
          labels={PAGINATION_RO}
        />
        <Pagination
          page={1}
          pageSize={20}
          total={12}
          onPageChange={() => {}}
          labels={PAGINATION_RO}
        />
      </Section>

      <Section title="Menu">
        <div className={styles.componentRow}>
          <Menu
            items={[
              { id: 'edit', label: 'Editează', icon: 'edit' },
              { id: 'duplicate', label: 'Duplică', icon: 'copy' },
              { id: 'delete', label: 'Șterge', icon: 'trash', isDanger: true },
            ]}
            onAction={(id) => console.log('action:', id)}
          >
            <Button variant="secondary">Acțiuni ▾</Button>
          </Menu>

          <Menu
            sections={[
              {
                label: 'Vizualizare',
                items: [
                  { id: 'list', label: 'Listă', icon: 'list', shortcut: '⌘1' },
                  { id: 'grid', label: 'Grilă', icon: 'grid', shortcut: '⌘2' },
                ],
              },
              {
                label: 'Export',
                items: [
                  { id: 'pdf', label: 'Export PDF', icon: 'file-text' },
                  { id: 'csv', label: 'Export CSV', icon: 'download' },
                ],
              },
            ]}
            onAction={(id) => console.log('action:', id)}
          >
            <Button variant="secondary">Secțiuni ▾</Button>
          </Menu>
        </div>
      </Section>

      <Section title="Tooltip">
        <div className={styles.componentRow}>
          <Tooltip content="Adaugă client nou" placement="top">
            <IconButton icon="plus" label="Adaugă" variant="secondary" />
          </Tooltip>
          <Tooltip content="Șterge definitiv" placement="bottom">
            <IconButton icon="trash" label="Șterge" variant="danger" />
          </Tooltip>
          <Tooltip content="Caută în platformă (⌘K)" placement="right">
            <IconButton icon="search" label="Caută" variant="secondary" />
          </Tooltip>
        </div>
      </Section>

      <Section title="Dialog">
        <div className={styles.componentRow}>
          <DialogTrigger>
            <Button variant="secondary">Dialog default</Button>
            <Dialog
              title="Confirmare acțiune"
              footer={
                <div className={styles.componentRow}>
                  <Button variant="secondary">Anulează</Button>
                  <Button variant="primary">Confirmă</Button>
                </div>
              }
            >
              Ești sigur că vrei să continui? Această acțiune nu poate fi anulată.
            </Dialog>
          </DialogTrigger>

          <DialogTrigger>
            <Button variant="danger">Dialog pericol</Button>
            <Dialog
              title="Șterge contul"
              tone="danger"
              footer={
                <div className={styles.componentRow}>
                  <Button variant="secondary">Anulează</Button>
                  <Button variant="danger">Șterge definitiv</Button>
                </div>
              }
            >
              Această acțiune va șterge permanent contul și toate datele asociate.
            </Dialog>
          </DialogTrigger>

          <DialogTrigger>
            <Button variant="quiet">Dialog fără închidere</Button>
            <Dialog title="Procesare..." isDismissable={false}>
              Se procesează datele. Te rugăm să aștepți...
            </Dialog>
          </DialogTrigger>
        </div>
      </Section>

      <Section title="Drawer">
        <div className={styles.componentRow}>
          <DrawerTrigger>
            <Button variant="secondary">Drawer dreapta</Button>
            <Drawer
              title="Editează client"
              footer={
                <div className={styles.componentRow}>
                  <Button variant="secondary">Anulează</Button>
                  <Button variant="primary">Salvează</Button>
                </div>
              }
            >
              <p>Conținut drawer — formular de editare client</p>
            </Drawer>
          </DrawerTrigger>
        </div>
      </Section>

      <Section title="CommandPalette">
        <div className={styles.componentStack}>
          <p style={{ fontSize: '13px', color: 'var(--ink-secondary)' }}>
            Apasă ⌘K / Ctrl+K sau butonul de mai jos pentru a deschide paleta de comenzi.
          </p>
          <Button variant="secondary" onPress={() => setCmdOpen(true)}>
            Deschide CommandPalette
          </Button>
          <CommandPalette commands={commands} isOpen={cmdOpen} onOpenChange={setCmdOpen} />
        </div>
      </Section>

      <Section title="Sheet / SheetSection">
        <Sheet>
          <SheetSection>
            <strong>Informații generale</strong>
            <p>Ana Popescu · ana@firma.ro · +40 712 345 678</p>
          </SheetSection>
          <SheetSection>
            <strong>Ultima programare</strong>
            <p>Vineri 14:30 — Consultanță financiară</p>
          </SheetSection>
          <SheetSection>
            <strong>Note</strong>
            <p>Client VIP — preferă întâlniri după-amiaza</p>
          </SheetSection>
        </Sheet>
      </Section>

      <Section title="PageHeader">
        <div className={styles.componentStack}>
          <PageHeader title="Clienți" />
          <PageHeader title="Programări" subtitle="Gestionează toate programările" />
          <PageHeader
            title="Setări cont"
            subtitle="Configurează preferințele aplicației"
            actions={
              <div className={styles.componentRow}>
                <Button variant="secondary">Anulează</Button>
                <Button variant="primary">Salvează</Button>
              </div>
            }
          />
        </div>
      </Section>

      <Section title="ContextBar">
        <div className={styles.componentStack}>
          <ContextBar title="Ventora Hub" labels={CONTEXTBAR_RO} />
          <ContextBar
            title="Ventora Hub"
            labels={CONTEXTBAR_RO}
            onSearch={() => {}}
            onCreate={() => {}}
            notifications={<IconButton icon="bell" label="Notificări" variant="quiet" />}
          />
        </div>
      </Section>

      <Section title="Spine">
        <div style={{ height: 360, display: 'flex', gap: 24 }}>
          <Spine
            labels={SPINE_RO}
            items={navItems}
            activeId={activeNav}
            onCollapsedChange={setSpineCollapsed}
            isCollapsed={spineCollapsed}
          />
          <Spine labels={SPINE_RO} items={navItems} activeId="clients" isCollapsed />
        </div>
      </Section>

      <Section title="AppShell">
        <div
          style={{
            height: 360,
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <AppShell
            contextBar={<ContextBar title="Demo AppShell" labels={CONTEXTBAR_RO} />}
            spine={
              <Spine
                labels={SPINE_RO}
                items={navItems}
                activeId={activeNav}
                onCollapsedChange={(v) => setActiveNav(v ? activeNav : activeNav)}
              />
            }
          >
            <PageHeader title="Dashboard" subtitle="Bun venit în Ventora" />
          </AppShell>
        </div>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}
