# 分治算法

分治算法（Divide and Conquer）是一种重要的算法设计范式。它将一个难以直接解决的大问题分解为若干规模较小的同类子问题，分别求解后再合并结果。分治思想广泛应用于排序、查找、矩阵运算、几何计算等领域，是理解递归与算法复杂度分析的基础。

## 概念定义

分治法的三个步骤：

1. **分解（Divide）**：将原问题分解为若干规模较小、相互独立、与原问题形式相同的子问题。
2. **解决（Conquer）**：递归地求解子问题；若子问题足够小则直接求解。
3. **合并（Combine）**：将子问题的解组合成原问题的解。

**适用条件**：

- 问题规模缩小后容易求解。
- 具有最优子结构（可分解为同类子问题）。
- 子问题的解可合并。
- 子问题相互独立（无重叠，否则应考虑动态规划）。

## 核心要点

### 分治与递归的关系

分治是一种算法设计思想，递归是实现分治的常见手段。分治算法通常可表示为：

```
T(n) = aT(n/b) + f(n)
```

其中 a 是子问题个数，n/b 是子问题规模，f(n) 是分解与合并的代价。

### 主定理（Master Theorem）

用于分析分治算法的时间复杂度：

```
T(n) = aT(n/b) + f(n)
```

- 若 f(n) = O(n^c), c < log_b a：T(n) = Θ(n^(log_b a))。
- 若 f(n) = Θ(n^(log_b a))：T(n) = Θ(n^(log_b a) · log n)。
- 若 f(n) = Ω(n^c), c > log_b a 且满足正则条件：T(n) = Θ(f(n))。

例如归并排序 T(n) = 2T(n/2) + O(n)，属于第二种情形，T(n) = O(n log n)。

### 经典分治算法

#### 1. 归并排序

- 分解：将数组从中间分成左右两半。
- 解决：递归排序左右两半。
- 合并：将两个有序子数组合并。
- 时间 O(n log n)，空间 O(n)，稳定排序。

#### 2. 快速排序

- 分解：选基准 pivot，将数组划分为小于和大于 pivot 两部分。
- 解决：递归排序两部分。
- 合并：无需合并（原地进行）。
- 平均 O(n log n)，最坏 O(n²)。

#### 3. 最近点对问题

给定平面上 n 个点，求距离最近的两个点。

- 分解：按 x 坐标排序，从中线分成左右两半。
- 解决：递归求左右半部分的最近点对距离 d。
- 合并：检查跨越中线的点对，仅需考虑中线两侧宽 d 的带状区域，并按 y 排序后比较相邻 7 个点。
- 时间复杂度 O(n log n)。

## 代码示例

### 归并排序（C）

```c
void merge(int arr[], int tmp[], int left, int mid, int right) {
    int i = left, j = mid + 1, k = left;
    while (i <= mid && j <= right) {
        if (arr[i] <= arr[j]) tmp[k++] = arr[i++];
        else tmp[k++] = arr[j++];
    }
    while (i <= mid)   tmp[k++] = arr[i++];
    while (j <= right) tmp[k++] = arr[j++];
    for (i = left; i <= right; i++) arr[i] = tmp[i];
}

void mergeSort(int arr[], int tmp[], int left, int right) {
    if (left >= right) return;
    int mid = left + (right - left) / 2;
    mergeSort(arr, tmp, left, mid);      // 分解 + 解决左半
    mergeSort(arr, tmp, mid + 1, right); // 解决右半
    merge(arr, tmp, left, mid, right);   // 合并
}
```

### 快速排序（Python）

```python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left  = [x for x in arr if x < pivot]
    mid   = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + mid + quick_sort(right)
```

### 最近点对（Python）

```python
import math

def closest_pair(points):
    pts = sorted(points, key=lambda p: p[0])
    return _closest(pts)

def _closest(pts):
    n = len(pts)
    if n <= 3:
        return brute_force(pts)
    mid = n // 2
    midx = pts[mid][0]
    d_left  = _closest(pts[:mid])
    d_right = _closest(pts[mid:])
    d = min(d_left, d_right)
    # 跨中线检查
    strip = [p for p in pts if abs(p[0] - midx) < d]
    strip.sort(key=lambda p: p[1])
    for i in range(len(strip)):
        j = i + 1
        while j < len(strip) and (strip[j][1] - strip[i][1]) < d:
            d = min(d, dist(strip[i], strip[j]))
            j += 1
    return d

def dist(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])

def brute_force(pts):
    d = float('inf')
    for i in range(len(pts)):
        for j in range(i+1, len(pts)):
            d = min(d, dist(pts[i], pts[j]))
    return d
```

## 常见考点

1. **分治三步骤**：分解、解决、合并，要求能用伪代码描述具体算法。
2. **主定理应用**：给定递推式 T(n) = aT(n/b) + f(n)，求时间复杂度。常考归并、快排、Strassen 矩阵乘法等。
3. **归并排序的合并过程**：手写 merge 函数，分析比较次数与逆序对计数。
4. **快排的划分策略**：Lomuto 与 Hoare 两种 partition 方式，及最坏情况分析。
5. **最近点对问题**：理解为何跨中线只需检查 7 个相邻点（6 个分格定理），时间复杂度为何为 O(n log n)。
6. **二分查找**：本质是分治（每次只递归一个子问题），分析其递推式 T(n) = T(n/2) + O(1)。
7. **分治 vs 动态规划**：子问题是否重叠是关键区别，分治适用于独立子问题，DP 适用于重叠子问题。
8. **常见应用**：大整数乘法（Karatsuba）、矩阵乘法（Strassen）、FFT、棋盘覆盖等经典问题。
