import type { V1Node, V1Pod } from '@kubernetes/client-node';
import { parseCpu, parseMemoryGiB } from './quantity.js';
import type { ClusterNode, K8sSnapshot, Priority, ScheduledPod, Task } from './types.js';

function getLabels(metadata?: { labels?: Record<string, string> }) {
  return metadata?.labels ?? {};
}

function podId(pod: V1Pod) {
  return `${pod.metadata?.namespace ?? 'default'}/${pod.metadata?.name ?? pod.metadata?.uid ?? 'unknown'}`;
}

function firstContainerImage(pod: V1Pod) {
  return pod.spec?.containers?.[0]?.image ?? 'unknown';
}

function requestedResources(pod: V1Pod) {
  return (pod.spec?.containers ?? []).reduce(
    (sum, container) => {
      const requests = container.resources?.requests ?? {};
      return {
        cpu: sum.cpu + parseCpu(requests.cpu),
        mem: sum.mem + parseMemoryGiB(requests.memory),
      };
    },
    { cpu: 0, mem: 0 },
  );
}

function priorityFromPod(pod: V1Pod): Priority {
  const priority = pod.spec?.priority ?? 0;
  if (priority >= 100000) return 'high';
  if (priority < 0) return 'low';
  return 'normal';
}

export function mapPodToTask(pod: V1Pod): Task {
  const resources = requestedResources(pod);

  return {
    id: podId(pod),
    name: pod.metadata?.name ?? pod.metadata?.uid ?? 'unknown-pod',
    reqCpu: resources.cpu,
    reqMem: resources.mem,
    createdAt: pod.metadata?.creationTimestamp?.getTime() ?? Date.now(),
    image: firstContainerImage(pod),
    priority: priorityFromPod(pod),
  };
}

export function isPendingForScheduler(pod: V1Pod, schedulerName: string) {
  return (
    pod.status?.phase === 'Pending' &&
    !pod.spec?.nodeName &&
    pod.spec?.schedulerName === schedulerName &&
    pod.metadata?.deletionTimestamp === undefined
  );
}

function mapPodToScheduledPod(pod: V1Pod): ScheduledPod {
  return {
    ...mapPodToTask(pod),
    boundAt: pod.status?.startTime?.getTime() ?? pod.metadata?.creationTimestamp?.getTime() ?? Date.now(),
  };
}

function nodeRole(node: V1Node) {
  const labels = getLabels(node.metadata);
  const roleLabel = Object.keys(labels).find((label) => label.startsWith('node-role.kubernetes.io/'));
  if (!roleLabel) return labels['kubernetes.io/role'] ?? 'worker';
  return roleLabel.replace('node-role.kubernetes.io/', '') || 'worker';
}

export function mapNodesAndPods(nodes: V1Node[], pods: V1Pod[]): ClusterNode[] {
  return nodes.map((node) => {
    const nodeName = node.metadata?.name ?? 'unknown-node';
    const residentPods = pods.filter((pod) => pod.spec?.nodeName === nodeName);
    const used = residentPods.reduce(
      (sum, pod) => {
        const resources = requestedResources(pod);
        return {
          cpu: sum.cpu + resources.cpu,
          mem: sum.mem + resources.mem,
        };
      },
      { cpu: 0, mem: 0 },
    );

    const labels = getLabels(node.metadata);

    return {
      id: nodeName,
      name: nodeName,
      zone: labels['topology.kubernetes.io/zone'] ?? labels['failure-domain.beta.kubernetes.io/zone'] ?? 'unknown',
      role: nodeRole(node),
      capacityCpu: parseCpu(node.status?.allocatable?.cpu ?? node.status?.capacity?.cpu),
      capacityMem: parseMemoryGiB(node.status?.allocatable?.memory ?? node.status?.capacity?.memory),
      usedCpu: used.cpu,
      usedMem: used.mem,
      pods: residentPods.map(mapPodToScheduledPod),
    };
  });
}

export function buildSnapshot(nodes: V1Node[], pods: V1Pod[], schedulerName: string): K8sSnapshot {
  return {
    nodes: mapNodesAndPods(nodes, pods),
    pendingQueue: pods.filter((pod) => isPendingForScheduler(pod, schedulerName)).map(mapPodToTask),
    failedTasks: [],
  };
}
