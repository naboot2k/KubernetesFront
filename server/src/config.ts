export const config = {
  port: Number(process.env.PORT ?? 8080),
  namespace: process.env.K8S_NAMESPACE ?? 'scheduler-demo',
  schedulerName: process.env.K8S_SCHEDULER_NAME ?? 'demo-scheduler',
  testPodImage: process.env.TEST_POD_IMAGE ?? 'nginx:1.27-alpine',
  testPodCountLimit: Number(process.env.TEST_POD_COUNT_LIMIT ?? 50),
  metricsPollIntervalMs: Number(process.env.METRICS_POLL_INTERVAL_MS ?? 3000),
};
