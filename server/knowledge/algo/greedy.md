# 贪心算法

贪心算法（Greedy Algorithm）是一种简单而高效的算法设计思想。它在求解最优化问题时，总是做出在当前看来最好的选择，即不从整体最优出发，而是期望通过一系列局部最优解最终达到全局最优。贪心算法代码简洁、效率高，但并非所有问题都适用，关键在于问题是否具备"贪心选择性质"。

## 概念定义

- **贪心选择性质（Greedy Choice Property）**：问题的整体最优解可以通过一系列局部最优选择达到，即当前选择不依赖未来的决策。
- **最优子结构**：问题的最优解包含子问题的最优解（与动态规划相同）。
- **贪心算法**：在每一步选择中采取当前状态下最好或最优的选择，从而希望得到全局最优解的算法策略。

## 核心要点

### 贪心 vs 动态规划

| 维度 | 贪心 | 动态规划 |
| --- | --- | --- |
| 决策方式 | 自顶向下，每步做不可撤回的选择 | 自底向上，考虑所有子问题 |
| 最优性 | 仅当满足贪心选择性质时全局最优 | 通常保证全局最优 |
| 子问题重叠 | 通常无重叠 | 通常有重叠 |
| 效率 | 高，常为 O(n log n) 或 O(n) | 较低，常为 O(n²) 或 O(nW) |

### 贪心算法的一般步骤

1. 将问题建模为若干阶段的选择。
2. 确定贪心策略：每步如何选最优。
3. 证明该策略满足贪心选择性质和最优子结构（关键步骤，常需数学证明）。
4. 实现算法并验证正确性。

### 常见贪心策略

- **按某个维度排序后逐个选取**：区间调度、活动选择。
- **优先选择最优性价比 / 最小代价元素**：哈夫曼编码、Kruskal 最小生成树。
- **尽可能多地使用大面额**：找零问题（受币种约束，并非任意币种都成立）。

### 经典问题

#### 1. 活动选择问题

有 n 个活动，每个活动有开始时间 s[i] 和结束时间 f[i]，活动互不冲突，求最多能安排多少个活动。
贪心策略：按结束时间升序排序，每次选最早结束且与已选活动不冲突的活动。

#### 2. 哈夫曼编码

构造带权路径长度最短的二叉树，用于数据压缩。
贪心策略：每次从集合中选出两个权值最小的节点合并，新节点权值为二者之和，重复直到只剩一棵树。
使用最小堆实现，时间复杂度 O(n log n)。

#### 3. 找零问题

给定面额集合 coins 和金额 amount，求最少硬币数。
贪心策略：每次使用尽可能大的面额。
注意：贪心仅对"规范币种"（如 1, 5, 10, 25）有效；对任意币种需用动态规划求解。

## 代码示例

### 活动选择（Python）

```python
def activity_selection(activities):
    # activities: [(start, finish), ...]
    activities.sort(key=lambda x: x[1])  # 按结束时间排序
    selected = [activities[0]]
    for s, f in activities[1:]:
        if s >= selected[-1][1]:  # 不与上一个冲突
            selected.append((s, f))
    return selected

# 示例
acts = [(1, 4), (3, 5), (0, 6), (5, 7), (3, 9), (5, 9),
        (6, 10), (8, 11), (8, 12), (2, 14), (12, 16)]
print(activity_selection(acts))
```

### 哈夫曼编码（C）

```c
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int weight;
    struct Node *left, *right;
} Node;

Node* newNode(int w) {
    Node* n = (Node*)malloc(sizeof(Node));
    n->weight = w; n->left = n->right = NULL;
    return n;
}

// 简化版：演示合并过程（实际应用最小堆）
Node* huffman(int freq[], int n) {
    // 假设已用最小堆管理，伪代码描述思想
    // while (堆中节点数 > 1) {
    //     a = extractMin();
    //     b = extractMin();
    //     parent = newNode(a->weight + b->weight);
    //     parent->left = a; parent->right = b;
    //     insert(parent);
    // }
    // return extractMin();
    return NULL;  // 占位
}
```

### 哈夫曼编码（Python，使用 heapq）

```python
import heapq

def huffman_codes(freq):
    heap = [[f, [sym, ""]] for sym, f in freq.items()]
    heapq.heapify(heap)
    while len(heap) > 1:
        lo = heapq.heappop(heap)
        hi = heapq.heappop(heap)
        for pair in lo[1:]:
            pair[1] = '0' + pair[1]
        for pair in hi[1:]:
            pair[1] = '1' + pair[1]
        heapq.heappush(heap, [lo[0] + hi[0]] + lo[1:] + hi[1:])
    return sorted(heapq.heappop(heap)[1:], key=lambda p: (len(p[1]), p[1]))
```

### 找零问题（贪心版，Python）

```python
def coin_change_greedy(amount, coins):
    coins.sort(reverse=True)
    result = []
    for c in coins:
        while amount >= c:
            amount -= c
            result.append(c)
    return result if amount == 0 else None  # None 表示无法凑出
```

## 常见考点

1. **贪心选择性质的证明**：常用交换论证法，假设最优解与贪心解不同，证明可替换不变得更差。
2. **活动选择问题**：要求按结束时间排序（而非开始时间或时长），并解释为何。
3. **哈夫曼树构造**：手动画出合并过程，计算 WPL（带权路径长度），常考选择题。
4. **贪心与动态规划的区分**：例如 0-1 背包不能用贪心（按性价比排序会失效），分数背包可以。
5. **区间问题**：区间调度、区间覆盖、合并区间，常结合排序策略考查。
6. **Dijkstra / Prim / Kruskal**：最短路径与最小生成树算法本质上也是贪心，要求理解其贪心策略与正确性条件。
7. **反例构造**：给出一个不满足贪心性质的问题，构造反例说明贪心失效（如任意币种下的找零问题）。
