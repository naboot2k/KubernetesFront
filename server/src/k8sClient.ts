import * as k8s from '@kubernetes/client-node';

export interface K8sClients {
  kc: k8s.KubeConfig;
  core: k8s.CoreV1Api;
  watch: k8s.Watch;
}

export function createK8sClients(): K8sClients {
  const kc = new k8s.KubeConfig();

  try {
    kc.loadFromCluster();
  } catch {
    kc.loadFromDefault();
  }

  return {
    kc,
    core: kc.makeApiClient(k8s.CoreV1Api),
    watch: new k8s.Watch(kc),
  };
}
