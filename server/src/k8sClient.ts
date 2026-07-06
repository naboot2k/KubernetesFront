import { existsSync } from 'node:fs';
import * as k8s from '@kubernetes/client-node';
import { Metrics } from '@kubernetes/client-node/dist/metrics.js';

export interface K8sClients {
  kc: k8s.KubeConfig;
  core: k8s.CoreV1Api;
  metrics: Metrics;
  watch: k8s.Watch;
}

export function createK8sClients(): K8sClients {
  const kc = new k8s.KubeConfig();
  const hasServiceAccount =
    existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token') &&
    existsSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');

  if (hasServiceAccount) {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }

  return {
    kc,
    core: kc.makeApiClient(k8s.CoreV1Api),
    metrics: new Metrics(kc),
    watch: new k8s.Watch(kc),
  };
}
