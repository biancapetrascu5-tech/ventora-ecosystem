/* eslint-disable i18next/no-literal-string */
import { notFound } from 'next/navigation';
import { Button } from '@ventora/ui';
import { IconButton } from '@ventora/ui';
import { Input } from '@ventora/ui';
import { Textarea } from '@ventora/ui';
import { Select } from '@ventora/ui';
import { Checkbox } from '@ventora/ui';
import { Radio, RadioGroup } from '@ventora/ui';
import { Toggle } from '@ventora/ui';
import { FormField } from '@ventora/ui';
import { SegmentedControl } from '@ventora/ui';
import { DesignFileUploads } from './DesignFileUploads';
import { Combobox } from '@ventora/ui';
import { Icon } from '@ventora/ui';
import { DesignLot3Client } from './DesignLot3Client';
import styles from './design.module.css';

export const dynamic = 'force-dynamic';

export default function DesignPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 6 250 68"
            role="img"
            aria-label="Ventora"
            height="40"
          >
            <svg x="8" y="10" width="60" height="60" viewBox="0 0 400 400" overflow="visible">
              <polygon points="200,150 352,262 200,330 48,262" fill="#161e38" />
              <polygon points="126,96 196,132 192,344 158,230" fill="#f2ede3" />
              <polygon points="274,96 204,132 208,344 242,230" fill="#f2ede3" />
              <polygon
                points="28,16 120,80 188,352 200,392"
                fill="#FFAA75"
                stroke="#0a1024"
                strokeWidth="6"
              />
              <polygon
                points="372,16 280,80 212,352 200,392"
                fill="#B1744F"
                stroke="#0a1024"
                strokeWidth="6"
              />
              <polygon
                points="200,172 200,362 162,246"
                fill="#FFAA75"
                stroke="#0a1024"
                strokeWidth="7"
              />
              <polygon
                points="200,172 238,246 200,362"
                fill="#B1744F"
                stroke="#0a1024"
                strokeWidth="7"
              />
            </svg>
            <path
              fill="#FFAA75"
              d="M90.960 47L85.695 47L77.622 28.100L83.400 28.100L88.530 40.412L93.768 28.100L99.060 28.100L90.960 47"
            />
            <path
              fill="var(--ink)"
              d="M118.986 47L103.812 47L103.812 28.100L118.635 28.100L118.635 32.231L109.104 32.231L109.104 35.417L117.501 35.417L117.501 39.413L109.104 39.413L109.104 42.869L118.986 42.869L118.986 47M130.434 47L125.196 47L125.196 28.100L129.597 28.100L137.940 38.171L137.940 28.100L143.178 28.100L143.178 47L138.777 47L130.434 36.929L130.434 47M159.567 47L154.221 47L154.221 32.339L148.416 32.339L148.416 28.100L165.345 28.100L165.345 32.339L159.567 32.339L159.567 47M180.114 47.378Q177.846 47.378 175.929 46.649Q174.012 45.920 172.595 44.584Q171.177 43.247 170.394 41.465Q169.611 39.683 169.611 37.550Q169.611 35.417 170.394 33.635Q171.177 31.853 172.595 30.517Q174.012 29.180 175.929 28.451Q177.846 27.722 180.114 27.722Q182.409 27.722 184.313 28.451Q186.216 29.180 187.620 30.517Q189.024 31.853 189.821 33.635Q190.617 35.417 190.617 37.550Q190.617 39.683 189.821 41.478Q189.024 43.274 187.620 44.597Q186.216 45.920 184.313 46.649Q182.409 47.378 180.114 47.378M180.114 42.950Q181.194 42.950 182.126 42.572Q183.057 42.194 183.746 41.478Q184.434 40.763 184.826 39.764Q185.217 38.765 185.217 37.550Q185.217 36.308 184.826 35.322Q184.434 34.337 183.746 33.621Q183.057 32.906 182.126 32.528Q181.194 32.150 180.114 32.150Q179.034 32.150 178.103 32.528Q177.171 32.906 176.483 33.621Q175.794 34.337 175.403 35.322Q175.011 36.308 175.011 37.550Q175.011 38.765 175.403 39.764Q175.794 40.763 176.483 41.478Q177.171 42.194 178.103 42.572Q179.034 42.950 180.114 42.950M202.011 47L196.665 47L196.665 28.100L205.116 28.100Q209.247 28.100 211.475 29.977Q213.702 31.853 213.702 35.093Q213.702 37.226 212.676 38.765Q211.704 40.250 210.003 41.060L214.080 47L208.356 47L204.927 41.978L202.011 41.978L202.011 47M202.011 32.312L202.011 37.847L204.981 37.847Q206.655 37.847 207.479 37.118Q208.302 36.389 208.302 35.093Q208.302 33.770 207.479 33.041Q206.655 32.312 204.981 32.312L202.011 32.312M223.071 47L217.617 47L225.960 28.100L231.225 28.100L239.595 47L234.033 47L232.548 43.328L224.556 43.328L223.071 47M226.122 39.386L230.982 39.386L228.552 33.338"
            />
          </svg>
          <span className={styles.badge}>Design System · Lot 1 + 2 + 3</span>
        </div>
        <p className={styles.subtitle}>
          Tokenuri, fonturi, logo — baza sistemului de design Ventora.
        </p>
      </header>

      <Section title="Logo">
        <div className={styles.logoGrid}>
          <LogoCard label="ventora-logo (light)" bg="light">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 6 250 68"
              role="img"
              aria-label="Ventora"
              height="48"
            >
              <svg x="8" y="10" width="60" height="60" viewBox="0 0 400 400" overflow="visible">
                <polygon points="200,150 352,262 200,330 48,262" fill="#161e38" />
                <polygon points="126,96 196,132 192,344 158,230" fill="#f2ede3" />
                <polygon points="274,96 204,132 208,344 242,230" fill="#f2ede3" />
                <polygon
                  points="28,16 120,80 188,352 200,392"
                  fill="#FFAA75"
                  stroke="#0a1024"
                  strokeWidth="6"
                />
                <polygon
                  points="372,16 280,80 212,352 200,392"
                  fill="#B1744F"
                  stroke="#0a1024"
                  strokeWidth="6"
                />
                <polygon
                  points="200,172 200,362 162,246"
                  fill="#FFAA75"
                  stroke="#0a1024"
                  strokeWidth="7"
                />
                <polygon
                  points="200,172 238,246 200,362"
                  fill="#B1744F"
                  stroke="#0a1024"
                  strokeWidth="7"
                />
              </svg>
              <path
                fill="#FFAA75"
                d="M90.960 47L85.695 47L77.622 28.100L83.400 28.100L88.530 40.412L93.768 28.100L99.060 28.100L90.960 47"
              />
              <path
                fill="#000C3F"
                d="M118.986 47L103.812 47L103.812 28.100L118.635 28.100L118.635 32.231L109.104 32.231L109.104 35.417L117.501 35.417L117.501 39.413L109.104 39.413L109.104 42.869L118.986 42.869L118.986 47M130.434 47L125.196 47L125.196 28.100L129.597 28.100L137.940 38.171L137.940 28.100L143.178 28.100L143.178 47L138.777 47L130.434 36.929L130.434 47M159.567 47L154.221 47L154.221 32.339L148.416 32.339L148.416 28.100L165.345 28.100L165.345 32.339L159.567 32.339L159.567 47M180.114 47.378Q177.846 47.378 175.929 46.649Q174.012 45.920 172.595 44.584Q171.177 43.247 170.394 41.465Q169.611 39.683 169.611 37.550Q169.611 35.417 170.394 33.635Q171.177 31.853 172.595 30.517Q174.012 29.180 175.929 28.451Q177.846 27.722 180.114 27.722Q182.409 27.722 184.313 28.451Q186.216 29.180 187.620 30.517Q189.024 31.853 189.821 33.635Q190.617 35.417 190.617 37.550Q190.617 39.683 189.821 41.478Q189.024 43.274 187.620 44.597Q186.216 45.920 184.313 46.649Q182.409 47.378 180.114 47.378M180.114 42.950Q181.194 42.950 182.126 42.572Q183.057 42.194 183.746 41.478Q184.434 40.763 184.826 39.764Q185.217 38.765 185.217 37.550Q185.217 36.308 184.826 35.322Q184.434 34.337 183.746 33.621Q183.057 32.906 182.126 32.528Q181.194 32.150 180.114 32.150Q179.034 32.150 178.103 32.528Q177.171 32.906 176.483 33.621Q175.794 34.337 175.403 35.322Q175.011 36.308 175.011 37.550Q175.011 38.765 175.403 39.764Q175.794 40.763 176.483 41.478Q177.171 42.194 178.103 42.572Q179.034 42.950 180.114 42.950M202.011 47L196.665 47L196.665 28.100L205.116 28.100Q209.247 28.100 211.475 29.977Q213.702 31.853 213.702 35.093Q213.702 37.226 212.676 38.765Q211.704 40.250 210.003 41.060L214.080 47L208.356 47L204.927 41.978L202.011 41.978L202.011 47M202.011 32.312L202.011 37.847L204.981 37.847Q206.655 37.847 207.479 37.118Q208.302 36.389 208.302 35.093Q208.302 33.770 207.479 33.041Q206.655 32.312 204.981 32.312L202.011 32.312M223.071 47L217.617 47L225.960 28.100L231.225 28.100L239.595 47L234.033 47L232.548 43.328L224.556 43.328L223.071 47M226.122 39.386L230.982 39.386L228.552 33.338"
              />
            </svg>
          </LogoCard>
          <LogoCard label="ventora-logo (dark)" bg="dark">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 6 250 68"
              role="img"
              aria-label="Ventora"
              height="48"
            >
              <svg x="8" y="10" width="60" height="60" viewBox="0 0 400 400" overflow="visible">
                <polygon points="200,150 352,262 200,330 48,262" fill="#161e38" />
                <polygon points="126,96 196,132 192,344 158,230" fill="#f2ede3" />
                <polygon points="274,96 204,132 208,344 242,230" fill="#f2ede3" />
                <polygon
                  points="28,16 120,80 188,352 200,392"
                  fill="#FFAA75"
                  stroke="#0a1024"
                  strokeWidth="6"
                />
                <polygon
                  points="372,16 280,80 212,352 200,392"
                  fill="#B1744F"
                  stroke="#0a1024"
                  strokeWidth="6"
                />
                <polygon
                  points="200,172 200,362 162,246"
                  fill="#FFAA75"
                  stroke="#0a1024"
                  strokeWidth="7"
                />
                <polygon
                  points="200,172 238,246 200,362"
                  fill="#B1744F"
                  stroke="#0a1024"
                  strokeWidth="7"
                />
              </svg>
              <path
                fill="#FFAA75"
                d="M90.960 47L85.695 47L77.622 28.100L83.400 28.100L88.530 40.412L93.768 28.100L99.060 28.100L90.960 47"
              />
              <path
                fill="#F1EFEA"
                d="M118.986 47L103.812 47L103.812 28.100L118.635 28.100L118.635 32.231L109.104 32.231L109.104 35.417L117.501 35.417L117.501 39.413L109.104 39.413L109.104 42.869L118.986 42.869L118.986 47M130.434 47L125.196 47L125.196 28.100L129.597 28.100L137.940 38.171L137.940 28.100L143.178 28.100L143.178 47L138.777 47L130.434 36.929L130.434 47M159.567 47L154.221 47L154.221 32.339L148.416 32.339L148.416 28.100L165.345 28.100L165.345 32.339L159.567 32.339L159.567 47M180.114 47.378Q177.846 47.378 175.929 46.649Q174.012 45.920 172.595 44.584Q171.177 43.247 170.394 41.465Q169.611 39.683 169.611 37.550Q169.611 35.417 170.394 33.635Q171.177 31.853 172.595 30.517Q174.012 29.180 175.929 28.451Q177.846 27.722 180.114 27.722Q182.409 27.722 184.313 28.451Q186.216 29.180 187.620 30.517Q189.024 31.853 189.821 33.635Q190.617 35.417 190.617 37.550Q190.617 39.683 189.821 41.478Q189.024 43.274 187.620 44.597Q186.216 45.920 184.313 46.649Q182.409 47.378 180.114 47.378M180.114 42.950Q181.194 42.950 182.126 42.572Q183.057 42.194 183.746 41.478Q184.434 40.763 184.826 39.764Q185.217 38.765 185.217 37.550Q185.217 36.308 184.826 35.322Q184.434 34.337 183.746 33.621Q183.057 32.906 182.126 32.528Q181.194 32.150 180.114 32.150Q179.034 32.150 178.103 32.528Q177.171 32.906 176.483 33.621Q175.794 34.337 175.403 35.322Q175.011 36.308 175.011 37.550Q175.011 38.765 175.403 39.764Q175.794 40.763 176.483 41.478Q177.171 42.194 178.103 42.572Q179.034 42.950 180.114 42.950M202.011 47L196.665 47L196.665 28.100L205.116 28.100Q209.247 28.100 211.475 29.977Q213.702 31.853 213.702 35.093Q213.702 37.226 212.676 38.765Q211.704 40.250 210.003 41.060L214.080 47L208.356 47L204.927 41.978L202.011 41.978L202.011 47M202.011 32.312L202.011 37.847L204.981 37.847Q206.655 37.847 207.479 37.118Q208.302 36.389 208.302 35.093Q208.302 33.770 207.479 33.041Q206.655 32.312 204.981 32.312L202.011 32.312M223.071 47L217.617 47L225.960 28.100L231.225 28.100L239.595 47L234.033 47L232.548 43.328L224.556 43.328L223.071 47M226.122 39.386L230.982 39.386L228.552 33.338"
              />
            </svg>
          </LogoCard>
        </div>
      </Section>

      <Section title="Culori">
        <ColorGroup title="Suprafețe" names={['canvas', 'sheet', 'raised', 'sunken', 'selected']} />
        <ColorGroup title="Text" names={['ink', 'ink-secondary', 'ink-muted', 'ink-disabled']} />
        <ColorGroup
          title="Linii"
          names={['line', 'line-strong', 'control-border', 'control-border-hover']}
        />
        <ColorGroup
          title="Acțiune primară"
          names={['primary', 'primary-hover', 'primary-pressed', 'on-primary']}
        />
        <ColorGroup
          title="Atenție (peach)"
          names={['attention', 'on-attention', 'attention-soft', 'attention-ink', 'attention-mark']}
        />
        <ColorGroup
          title="Confirmat (lime)"
          names={['done', 'on-done', 'done-soft', 'done-ink', 'done-mark']}
        />
        <ColorGroup
          title="Pericol"
          names={['danger', 'danger-hover', 'on-danger', 'danger-soft', 'danger-ink']}
        />
        <ColorGroup
          title="Sistem"
          names={[
            'focus-ring',
            'scrim',
            'skeleton',
            'skeleton-highlight',
            'neutral-soft',
            'avatar-bg',
            'tooltip-bg',
            'tooltip-ink',
          ]}
        />
        <ColorGroup
          title="App Icons"
          names={[
            'appicon-plate',
            'appicon-edge',
            'appicon-shape',
            'appicon-accent',
            'appicon-plate-muted',
            'appicon-shape-muted',
            'appicon-accent-muted',
          ]}
        />
        <ColorGroup
          title="Grafice — categorii"
          names={[
            'chart-1',
            'chart-2',
            'chart-3',
            'chart-4',
            'chart-5',
            'chart-compare',
            'chart-now',
            'chart-grid',
            'chart-axis',
            'chart-label',
          ]}
        />
        <ColorGroup
          title="Grafice — secvențial"
          names={['chart-seq-1', 'chart-seq-2', 'chart-seq-3', 'chart-seq-4', 'chart-seq-5']}
        />
      </Section>

      <Section title="Tipografie">
        <div className={styles.typeStack}>
          <TypeRow
            name="display-xl"
            family="display"
            size="40px / 44px"
            weight="700"
            sample="Bine ai venit în Ventora"
          />
          <TypeRow
            name="display-l"
            family="display"
            size="30px / 36px"
            weight="700"
            sample="Bună dimineața, Bianca"
          />
          <TypeRow
            name="display-m"
            family="display"
            size="22px / 28px"
            weight="600"
            sample="Aplicațiile tale"
          />
          <TypeRow name="title" family="sans" size="20px / 28px" weight="600" sample="Programări" />
          <TypeRow
            name="heading"
            family="sans"
            size="16px / 24px"
            weight="600"
            sample="Detalii client"
          />
          <TypeRow
            name="subheading"
            family="sans"
            size="14px / 20px"
            weight="600"
            sample="Necesită atenția ta"
          />
          <TypeRow
            name="body"
            family="sans"
            size="14px / 20px"
            weight="400"
            sample="Programarea a fost mutată pe joi, 14:30."
          />
          <TypeRow
            name="body-strong"
            family="sans"
            size="14px / 20px"
            weight="500"
            sample="Ana Popescu"
          />
          <TypeRow
            name="body-small"
            family="sans"
            size="13px / 18px"
            weight="400"
            sample="Ultima modificare acum 5 minute"
          />
          <TypeRow
            name="caption"
            family="sans"
            size="12px / 16px"
            weight="500"
            sample="Câmp obligatoriu"
          />
          <TypeRow name="numeric" family="sans" size="28px / 32px" weight="600" sample="1.284" />
        </div>
      </Section>

      <Section title="Spațiere">
        <div className={styles.spaceStack}>
          {(
            [
              'space-0',
              'space-0-5',
              'space-1',
              'space-2',
              'space-3',
              'space-4',
              'space-5',
              'space-6',
              'space-8',
              'space-10',
              'space-12',
              'space-16',
            ] as const
          ).map((t) => (
            <SpaceRow key={t} token={t} />
          ))}
        </div>
      </Section>

      <Section title="Rază">
        <div className={styles.radiusRow}>
          {(['radius-xs', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl'] as const).map((t) => (
            <RadiusCard key={t} token={t} />
          ))}
          <RadiusCard token="radius-full" />
        </div>
      </Section>

      <Section title="Umbre">
        <div className={styles.shadowRow}>
          <ShadowCard token="shadow-1" label="Tile hover" />
          <ShadowCard token="shadow-2" label="Menu / popover" />
          <ShadowCard token="shadow-3" label="Dialog / drawer" />
        </div>
      </Section>

      <Section title="Durată și easing">
        <div className={styles.motionRow}>
          {(['duration-instant', 'duration-fast', 'duration-base', 'duration-slow'] as const).map(
            (t) => (
              <MotionCard key={t} token={t} />
            ),
          )}
        </div>
      </Section>

      {/* ── LOT 2 ───────────────────────────────────────────── */}

      <Section title="Button">
        <div className={styles.componentRow}>
          <Button variant="primary">Primar</Button>
          <Button variant="secondary">Secundar</Button>
          <Button variant="quiet">Liniștit</Button>
          <Button variant="danger">Pericol</Button>
        </div>
        <div className={styles.componentRow}>
          <Button variant="primary" size="sm">
            Mic
          </Button>
          <Button variant="primary" size="md">
            Mediu
          </Button>
          <Button variant="primary" size="lg">
            Mare
          </Button>
        </div>
        <div className={styles.componentRow}>
          <Button variant="primary" isPending>
            Se salvează...
          </Button>
          <Button variant="primary" isDisabled>
            Dezactivat
          </Button>
        </div>
      </Section>

      <Section title="IconButton">
        <div className={styles.componentRow}>
          <IconButton icon="search" label="Caută" variant="secondary" />
          <IconButton icon="plus" label="Adaugă" variant="primary" />
          <IconButton icon="trash" label="Șterge" variant="danger" />
          <IconButton icon="search" label="Caută" variant="secondary" isDisabled />
        </div>
      </Section>

      <Section title="Icon">
        <div className={styles.componentRow}>
          <Icon icon="search" size="sm" label="Căutare mică" />
          <Icon icon="search" size="md" label="Căutare medie" />
          <Icon icon="search" size="lg" label="Căutare mare" />
        </div>
      </Section>

      <Section title="Input">
        <div className={styles.componentStack}>
          <Input placeholder="Default" />
          <Input placeholder="Cu icon" iconStart="search" />
          <Input placeholder="Invalid" isInvalid />
          <Input placeholder="Dezactivat" disabled />
          <Input placeholder="Read-only" readOnly defaultValue="Valoare read-only" />
        </div>
      </Section>

      <Section title="Textarea">
        <div className={styles.componentStack}>
          <Textarea placeholder="Descrie serviciul..." rows={3} />
          <Textarea placeholder="Invalid" rows={3} isInvalid />
          <Textarea placeholder="Dezactivat" rows={3} disabled />
        </div>
      </Section>

      <Section title="Select">
        <div className={styles.componentStack}>
          <Select
            options={[
              { value: 'ro', label: 'Română' },
              { value: 'en', label: 'English' },
              { value: 'fr', label: 'Français' },
              { value: 'es', label: 'Español' },
              { value: 'de', label: 'Deutsch' },
              { value: 'it', label: 'Italiano' },
            ]}
            placeholder="Alege limba"
          />
          <Select options={[{ value: 'ro', label: 'Română' }]} placeholder="Invalid" isInvalid />
          <Select
            options={[{ value: 'ro', label: 'Română' }]}
            placeholder="Dezactivat"
            isDisabled
          />
        </div>
      </Section>

      <Section title="Checkbox">
        <div className={styles.componentStack}>
          <Checkbox>Neselectat</Checkbox>
          <Checkbox defaultSelected>Selectat</Checkbox>
          <Checkbox isIndeterminate>Intermediar</Checkbox>
          <Checkbox isDisabled>Dezactivat</Checkbox>
          <Checkbox isInvalid>Invalid</Checkbox>
        </div>
      </Section>

      <Section title="Radio / RadioGroup">
        <div className={styles.componentRow}>
          <RadioGroup label="Vertical (default)">
            <Radio value="a">Opțiunea A</Radio>
            <Radio value="b">Opțiunea B</Radio>
            <Radio value="c" isDisabled>
              Dezactivat
            </Radio>
          </RadioGroup>
          <RadioGroup label="Orizontal" orientation="horizontal">
            <Radio value="x">X</Radio>
            <Radio value="y">Y</Radio>
            <Radio value="z">Z</Radio>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Toggle">
        <div className={styles.componentStack}>
          <Toggle>Notificări email</Toggle>
          <Toggle defaultSelected>Mod întunecat (activ)</Toggle>
          <Toggle isDisabled>Dezactivat</Toggle>
        </div>
      </Section>

      <Section title="FormField">
        <div className={styles.componentStack}>
          <FormField id="design-email" label="Email" required hint="Adresa ta de email de afaceri">
            <Input id="design-email" type="email" placeholder="ana@firma.ro" />
          </FormField>
          <FormField id="design-mesaj" label="Mesaj" error="Câmpul este obligatoriu">
            <Textarea id="design-mesaj" isInvalid rows={3} placeholder="Scrie un mesaj..." />
          </FormField>
        </div>
      </Section>

      <Section title="SegmentedControl">
        <div className={styles.componentStack}>
          <SegmentedControl
            aria-label="Vizualizare"
            options={[
              { value: 'list', label: 'Listă' },
              { value: 'grid', label: 'Grilă' },
              { value: 'map', label: 'Hartă' },
            ]}
          />
          <SegmentedControl
            aria-label="Vizualizare lată"
            fullWidth
            options={[
              { value: 'day', label: 'Zi' },
              { value: 'week', label: 'Săptămână' },
              { value: 'month', label: 'Lună' },
            ]}
          />
        </div>
      </Section>

      <Section title="Combobox">
        <div className={styles.componentStack}>
          <Combobox
            options={[
              { value: 'buc', label: 'București' },
              { value: 'clj', label: 'Cluj-Napoca' },
              { value: 'tms', label: 'Timișoara' },
              { value: 'iasi', label: 'Iași' },
              { value: 'bv', label: 'Brașov' },
            ]}
            placeholder="Caută oraș..."
            noResultsLabel="Niciun oraș găsit"
          />
          <Combobox
            options={[{ value: 'buc', label: 'București' }]}
            placeholder="Invalid"
            isInvalid
          />
          <Combobox
            options={[{ value: 'buc', label: 'București' }]}
            placeholder="Dezactivat"
            isDisabled
          />
        </div>
      </Section>

      <Section title="FileUpload">
        <div className={styles.componentStack}>
          <DesignFileUploads />
        </div>
      </Section>

      {/* ── LOT 3 ───────────────────────────────────────────── */}
      <DesignLot3Client />
    </div>
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

function ColorGroup({ title, names }: { title: string; names: string[] }) {
  return (
    <div className={styles.colorGroup}>
      <h3 className={styles.colorGroupTitle}>{title}</h3>
      <div className={styles.colorSwatches}>
        {names.map((n) => (
          <div key={n} className={styles.swatch}>
            <div
              className={styles.swatchColor}
              style={{ background: `var(--${n})`, border: '1px solid var(--line)' }}
            />
            <span className={styles.swatchName}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeRow({
  name,
  family,
  size,
  weight,
  sample,
}: {
  name: string;
  family: 'display' | 'sans';
  size: string;
  weight: string;
  sample: string;
}) {
  const fontFamily = family === 'display' ? 'var(--font-display)' : 'var(--font-sans)';
  const [fs, lh] = size.split(' / ');
  return (
    <div className={styles.typeRow}>
      <div className={styles.typeMeta}>
        <code className={styles.typeToken}>{name}</code>
        <span className={styles.typeSpec}>
          {size} · {weight} · {family}
        </span>
      </div>
      <div
        className={styles.typeSample}
        style={{ fontFamily, fontSize: fs, lineHeight: lh, fontWeight: weight }}
      >
        {sample}
      </div>
    </div>
  );
}

function LogoCard({
  label,
  bg,
  children,
}: {
  label: string;
  bg: 'light' | 'dark';
  children: React.ReactNode;
}) {
  return (
    <div className={styles.logoCard} data-bg={bg}>
      <div className={styles.logoCardInner}>{children}</div>
      <span className={styles.logoCardLabel}>{label}</span>
    </div>
  );
}

function SpaceRow({ token }: { token: string }) {
  return (
    <div className={styles.spaceRow}>
      <code className={styles.spaceToken}>{token}</code>
      <div className={styles.spaceBar} style={{ width: `var(--${token})`, minWidth: '2px' }} />
    </div>
  );
}

function RadiusCard({ token }: { token: string }) {
  return (
    <div className={styles.radiusCard}>
      <div className={styles.radiusBox} style={{ borderRadius: `var(--${token})` }} />
      <code className={styles.radiusLabel}>{token}</code>
    </div>
  );
}

function ShadowCard({ token, label }: { token: string; label: string }) {
  return (
    <div className={styles.shadowCard} style={{ boxShadow: `var(--${token})` }}>
      <code className={styles.shadowToken}>{token}</code>
      <span className={styles.shadowLabel}>{label}</span>
    </div>
  );
}

function MotionCard({ token }: { token: string }) {
  return (
    <div className={styles.motionCard}>
      <code className={styles.motionToken}>{token}</code>
    </div>
  );
}
