import { notFound } from 'next/navigation';
import { DemoClient } from './DemoClient';

export const dynamic = 'force-dynamic';

export default function DemoPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DemoClient />;
}
