# 真实 Kubernetes 调度接入后端契约

本前端已经支持 `mock` 与 `k8s` 两种运行模式。真实模式下，浏览器不会直接访问 Kubernetes API Server，而是访问一个受控后端代理：

```text
React Frontend -> /api/k8s -> k8s-scheduler-api -> Kubernetes API Server
```

后端已经在本仓库 `server/` 目录中实现，使用 Node.js、TypeScript、Express 和 `@kubernetes/client-node`，并在集群内使用 ServiceAccount + RBAC 访问 Kubernetes API。

## 环境变量

前端通过以下变量决定后端地址：

```bash
VITE_K8S_API_BASE_URL=/api/k8s
```

后端支持以下环境变量：

```bash
PORT=8080
K8S_NAMESPACE=scheduler-demo
K8S_SCHEDULER_NAME=demo-scheduler
TEST_POD_IMAGE=nginx:1.27-alpine
TEST_POD_COUNT_LIMIT=50
```

生产部署时推荐让 Nginx 反向代理 `/api/k8s/` 到集群内后端服务，避免浏览器暴露 kubeconfig、token 或 API Server 地址。

## 数据模型

前端期望后端把 Kubernetes Node / Pod 映射为以下结构。

### Task

```ts
interface Task {
  id: string;
  name: string;
  reqCpu: number;
  reqMem: number;
  createdAt: number;
  image: string;
  priority: 'low' | 'normal' | 'high';
}
```

建议映射：

- `id`: `${namespace}/${podName}` 或 Pod UID
- `name`: Pod 名称
- `reqCpu`: `resources.requests.cpu` 转换为 core 数
- `reqMem`: `resources.requests.memory` 转换为 GiB
- `createdAt`: `metadata.creationTimestamp`
- `image`: 第一个容器镜像名或工作负载标签
- `priority`: 根据 PriorityClass 或业务标签映射

### ClusterNode

```ts
interface ClusterNode {
  id: string;
  name: string;
  zone: string;
  role: string;
  capacityCpu: number;
  capacityMem: number;
  usedCpu: number;
  usedMem: number;
  pods: ScheduledPod[];
}
```

建议映射：

- `capacityCpu`: Node allocatable CPU
- `capacityMem`: Node allocatable memory GiB
- `usedCpu`: 该节点已调度 Pod requests.cpu 总和，或 Metrics Server 当前使用值
- `usedMem`: 该节点已调度 Pod requests.memory 总和，或 Metrics Server 当前使用值
- `pods`: `spec.nodeName === node.name` 的 Pod 列表

## REST 接口

### 获取集群快照

```http
GET /api/k8s/snapshot
```

响应：

```json
{
  "nodes": [],
  "pendingQueue": [],
  "failedTasks": []
}
```

用途：

- 前端切换到真实 K8s 模式时初始化节点拓扑和 Pending Queue。
- 后端可返回所有未绑定且 `schedulerName` 匹配的 Pod。

### 请求调度决策

```http
POST /api/k8s/scheduler/decisions
Content-Type: application/json
```

请求：

```json
{
  "task": {},
  "nodes": [],
  "strategy": "LeastRequested"
}
```

响应：

```json
{
  "targetNodeId": "node-compute-1",
  "score": 92,
  "reason": "least allocated node"
}
```

如果无法调度：

```json
{
  "targetNodeId": null,
  "reason": "内存不足"
}
```

后端可以在这里调用真实调度算法，也可以仅做预测，然后由 `/bindings` 完成绑定。

### 提交绑定

```http
POST /api/k8s/bindings
Content-Type: application/json
```

请求：

```json
{
  "task": {},
  "targetNodeId": "node-compute-1",
  "score": 92,
  "strategy": "LeastRequested"
}
```

后端行为：

1. 校验 Pod 仍处于 Pending 且未绑定。
2. 校验目标 Node 仍可用。
3. 调用 Kubernetes Binding API 或 Patch Pod `spec.nodeName`。
4. 返回新的节点快照，或通过 SSE 后续推送。

响应：

```json
{
  "nodes": []
}
```

### 删除 Pod

```http
POST /api/k8s/pods/delete
Content-Type: application/json
```

请求：

```json
{
  "nodeId": "node-compute-1",
  "taskId": "default/pod-nginx-9k2"
}
```

后端行为：

- 根据 `taskId` 找到 namespace/name 或 UID。
- 调用 Kubernetes Delete Pod API。
- 返回最新节点快照，或通过 SSE 推送。

### 创建测试 Pod 突发流量

```http
POST /api/k8s/tasks/burst
Content-Type: application/json
```

请求：

```json
{
  "count": 10
}
```

后端行为：

- 在受控 namespace 中创建 `count` 个测试 Pod。
- 推荐设置 `spec.schedulerName: demo-scheduler`，避免默认调度器抢先绑定。

响应：

```json
{
  "tasks": []
}
```

## SSE 事件流

```http
GET /api/k8s/events
Accept: text/event-stream
```

前端使用 `EventSource` 连接。后端每条消息使用 JSON：

```text
data: {"type":"snapshot","nodes":[],"pendingQueue":[]}

data: {"type":"task","task":{}}

data: {"type":"nodeUpdate","nodes":[]}

data: {"type":"log","message":"watch received pod","tone":"info"}
```

支持事件类型：

- `snapshot`: 全量快照。
- `task`: 新 Pending Pod 入队。
- `nodeUpdate`: 节点资源或 Pod 列表变化。
- `log`: 调度事件日志。

## RBAC 建议

本项目提供 `k8s/rbac.yaml`，最小权限限制在专用 namespace，并额外允许读取 Node：

- `get/list/watch pods`
- `create pods`
- `delete pods`
- `get/list/watch nodes`
- `create pods/binding`
- `get/list/watch events`

如果读取 Metrics Server：

- `get/list nodes.metrics.k8s.io`
- `get/list pods.metrics.k8s.io`

## 调度器建议

真实调度演示推荐创建测试 Pod 时设置：

```yaml
spec:
  schedulerName: demo-scheduler
```

后端只 watch `spec.schedulerName === "demo-scheduler"` 且 `spec.nodeName` 为空的 Pod，避免干扰集群默认调度器。
