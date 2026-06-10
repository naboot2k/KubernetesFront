# KubernetesFront

Kubernetes 调度器可视化沙箱，支持两种运行模式：

- **模拟沙箱模式**：纯前端模拟任务流入、队列堆积、调度决策、飞行动效和节点资源变化。
- **真实 K8s 模式**：通过后端代理接入真实 Kubernetes 集群，读取真实 Node / Pod / Event，并提交调度绑定请求。

## 本地运行

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:5173/
```

## 构建

```bash
npm run build
```

## 真实 K8s 接入

前端通过环境变量指定后端代理地址：

```bash
VITE_K8S_API_BASE_URL=/api/k8s
```

后端接口契约见：

```text
docs/k8s-backend-contract.md
```

后端代理位于：

```text
server/
```

本地开发后端：

```bash
cd server
npm install
npm run dev
```

后端默认会优先读取集群内 ServiceAccount；本地开发时回退读取默认 kubeconfig。

生产部署可使用项目内 `Dockerfile` 和 `k8s/frontend.yaml`。浏览器不应直接持有 kubeconfig 或 ServiceAccount Token，真实集群访问必须由后端代理完成。

后端镜像与清单：

```bash
docker build -t your-registry/k8s-scheduler-api:latest server
docker push your-registry/k8s-scheduler-api:latest
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/scheduler-api.yaml
```
