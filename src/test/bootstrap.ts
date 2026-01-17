import { performance } from 'perf_hooks';
(global as any).performance = performance;

if (!process.env.WADROOT) {
    console.error('Missing env variable WADROOT')
    process.exit(1);
}
