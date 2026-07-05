# 图

## 概念定义

**图（Graph）** 由顶点集 V 和边集 E 组成，记作 G = (V, E)。图可分为：

- **无向图**：边没有方向，(u, v) 与 (v, u) 相同。
- **有向图**：边有方向，<u, v> 表示从 u 指向 v。
- **带权图**：边上带权值，常用于最短路径问题。

## 核心要点

### 1. 图的存储

- **邻接矩阵**：用 n×n 二维数组 `a[i][j]` 表示边。无向图对称，查找 O(1)，但空间 O(n²)，适合稠密图。
- **邻接表**：每个顶点维护一个链表，存所有相邻顶点。空间 O(n+e)，适合稀疏图，遍历邻居高效。

### 2. 图的遍历

- **DFS（深度优先搜索）**：用栈/递归，沿一条路走到底再回溯。时间复杂度：邻接矩阵 O(n²)，邻接表 O(n+e)。
- **BFS（广度优先搜索）**：用队列，逐层扩展，可求无权图最短路径。时间复杂度同 DFS。

### 3. 最短路径

- **Dijkstra 算法**：单源最短路径，要求边权非负。贪心策略：每次取距离最近的未访问顶点松弛邻居。可用最小堆优化到 O((n+e) log n)。
- **Floyd 算法**：任意两点最短路径，动态规划，O(n³)，可处理负权（不能有负环）。

### 4. 最小生成树（MST）

针对连通无向图，包含所有顶点且边权之和最小的生成树，边数 = n - 1。

- **Prim 算法**：从一个点出发，每次选与当前生成树距离最近的顶点加入。适合稠密图，O(n²)。
- **Kruskal 算法**：按边权升序排序，依次加入不形成环的边（并查集判环）。适合稀疏图，O(e log e)。

## 代码示例

### C 语言：邻接矩阵 + DFS/BFS

```c
#include <stdio.h>
#define N 5

int g[N][N] = {
    {0,1,1,0,0},
    {1,0,0,1,0},
    {1,0,0,1,1},
    {0,1,1,0,1},
    {0,0,1,1,0}
};
int visited[N] = {0};

void dfs(int v) {
    visited[v] = 1;
    printf("%d ", v);
    for (int i = 0; i < N; i++)
        if (g[v][i] && !visited[i]) dfs(i);
}

int q[N], front = 0, rear = 0;
void bfs(int start) {
    int vis[N] = {0};
    q[rear++] = start; vis[start] = 1;
    while (front < rear) {
        int v = q[front++];
        printf("%d ", v);
        for (int i = 0; i < N; i++)
            if (g[v][i] && !vis[i]) { vis[i] = 1; q[rear++] = i; }
    }
}

int main() {
    dfs(0); printf("\n");   // 0 1 3 2 4
    bfs(0); printf("\n");   // 0 1 2 3 4
    return 0;
}
```

### Python：Dijkstra 算法（最小堆优化）

```python
import heapq

def dijkstra(graph, start):
    # graph: {u: [(v, w), ...]}
    dist = {v: float('inf') for v in graph}
    dist[start] = 0
    pq = [(0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue           # 过期记录跳过
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heapq.heappush(pq, (dist[v], v))
    return dist

# Kruskal 最小生成树（并查集）
class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
    def find(self, x):
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]
    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx == ry: return False
        self.parent[rx] = ry
        return True

def kruskal(n, edges):
    # edges: [(w, u, v), ...]
    edges.sort()
    dsu = DSU(n)
    total = 0; cnt = 0
    for w, u, v in edges:
        if dsu.union(u, v):
            total += w
            cnt += 1
            if cnt == n - 1: break
    return total

g = {0:[(1,2),(2,5)], 1:[(2,1),(3,7)], 2:[(3,1)], 3:[]}
print(dijkstra(g, 0))   # {0:0, 1:2, 2:3, 3:4}

edges = [(2,0,1),(5,0,2),(1,1,2),(7,1,3),(1,2,3)]
print(kruskal(4, edges))  # 4
```

## 常见考点

1. **邻接矩阵 vs 邻接表**：空间、查边效率、适合图类型，必考对比。
2. **DFS/BFS 复杂度**：邻接表 O(n+e)，邻接矩阵 O(n²)；连通分量、可达性问题。
3. **Dijkstra 不能处理负权**：负权需用 Bellman-Ford，负环用 SPFA 检测。
4. **Dijkstra 与 Prim 的相似与区别**：都是贪心 + 优先队列，但 Dijkstra 求单源最短路径，Prim 求 MST。
5. **Kruskal 并查集判环**：常考并查集路径压缩与按秩合并。
6. **拓扑排序**：有向无环图（DAG），可用 BFS（入度法）或 DFS。判断图是否有环。
7. **关键路径**：AOE 网中求最长路径，常考最早/最迟发生时间。
8. **图的连通性**：无向图连通分量、有向图强连通分量（Tarjan/Kosaraju）。

图论是数据结构中最综合的部分，DFS/BFS、Dijkstra、MST、拓扑排序是高频考点，务必理解算法思想并能手写代码。
