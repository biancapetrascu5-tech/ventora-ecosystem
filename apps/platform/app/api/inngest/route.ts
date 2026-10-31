import { serve } from 'inngest/next';
import { jobFunctions, jobsClient } from '@/server/jobs';

/* Ruta comună a serviciului de job-uri (Lot 4.2). Nu se schimbă când apare un job nou: job-urile
   se înregistrează în src/server/jobs.ts (registrul platformei). */
export const { GET, POST, PUT } = serve({ client: jobsClient, functions: jobFunctions });
