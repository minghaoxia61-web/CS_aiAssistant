# 搜索算法

搜索算法（Searching Algorithm）用于在数据集合中查找满足特定条件的元素。搜索是程序设计中最常见的操作之一，从数据库查询到编译器符号表查找都离不开它。不同数据结构和应用场景下应选择合适的搜索算法，以达到最优的时间与空间效率。

## 概念定义

- **顺序查找（Sequential Search）**：又称线性查找，从数据集合的一端开始，逐个比较关键字，直到找到目标或扫描完毕。
- **二分查找（Binary Search）**：要求集合有序，每次比较中间元素，根据大小关系将搜索区间缩小一半。
- **哈希查找（Hash Search）**：通过哈希函数将关键字映射到存储位置，理论查找时间复杂度 O(1)。
- **查找判定树（ASL）**：衡量查找算法效率的指标，即平均查找长度（Average Search Length）。

## 核心要点

### 1. 顺序查找

- 适用于任何存储结构（顺序表、链表均可）。
- 不要求有序。
- 时间复杂度：查找成功 ASL = (n+1)/2，查找失败 O(n)。
- 优化：设置"哨兵"可省去每次判断是否越界。

### 2. 二分查找

前提条件：数据有序且支持随机访问（顺序表）。基本思路：

```
while low <= high:
    mid = (low + high) // 2
    if arr[mid] == target: return mid
    elif arr[mid] < target: low = mid + 1
    else: high = mid - 1
```

- 时间复杂度 O(log n)，空间 O(1)。
- 判定树为平衡二叉树，ASL ≈ log₂(n+1)。

### 3. 二分查找的变体

- **查找第一个等于目标的位置**：当 `arr[mid] >= target` 时 `high = mid - 1`，记录命中位置。
- **查找最后一个等于目标的位置**：当 `arr[mid] <= target` 时 `low = mid + 1`，记录命中位置。
- **查找第一个大于等于目标的位置**（lower_bound）。
- **查找最后一个小于等于目标的位置**（upper_bound 的前驱）。

### 4. 哈希查找

- **哈希函数**：常用除留余数法 `H(key) = key % p`（p 选不大于表长的最大质数）。
- **冲突处理**：
  - 开放定址法：线性探测、二次探测、再哈希。
  - 链地址法（拉链法）：同义词挂在同一链表上。
- **装填因子 α = n/m**：α 越小冲突概率越低，但空间利用率低。
- 查找成功/失败的 ASL 与冲突处理方法、α 相关。

## 代码示例

### 顺序查找（C，含哨兵）

```c
// arr[0] 作为哨兵，数据从 arr[1] 开始
int sequentialSearch(int arr[], int n, int target) {
    int i = n;
    arr[0] = target;  // 哨兵
    while (arr[i] != target) i--;
    return i;  // 返回 0 表示未找到
}
```

### 标准二分查找（C）

```c
int binarySearch(int arr[], int n, int target) {
    int low = 0, high = n - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;  // 防溢出
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}
```

### 查找第一个等于目标的位置（Python）

```python
def lower_bound(arr, target):
    # 返回第一个 >= target 的下标
    low, high = 0, len(arr)
    while low < high:
        mid = (low + high) // 2
        if arr[mid] < target:
            low = mid + 1
        else:
            high = mid
    return low

def first_equal(arr, target):
    idx = lower_bound(arr, target)
    if idx < len(arr) and arr[idx] == target:
        return idx
    return -1
```

### 哈希查找（Python，拉链法）

```python
class HashTable:
    def __init__(self, size=10):
        self.size = size
        self.table = [[] for _ in range(size)]

    def _hash(self, key):
        return key % self.size

    def insert(self, key):
        self.table[self._hash(key)].append(key)

    def search(self, key):
        for v in self.table[self._hash(key)]:
            if v == key:
                return True
        return False
```

## 常见考点

1. **二分查找的递归与非递归实现**：必考，注意边界条件 `low <= high` 还是 `low < high`，以及 `mid = low + (high - low) / 2` 防止整数溢出。
2. **二分变体应用**：在旋转排序数组中查找、在有序矩阵中查找、查找峰值元素等。
3. **哈希表的构造与冲突处理**：给定关键字序列和哈希函数，画出哈希表并计算 ASL（成功 / 失败）。线性探测法容易产生"聚集"现象。
4. **ASL 计算**：包括顺序查找、二分查找、分块查找、哈希查找的 ASL 公式与计算。
5. **分块查找（索引顺序查找）**：将表分块，块间有序、块内无序，先二分定位块再块内顺序查找。
6. **时间复杂度比较**：二分 O(log n) 仅适用于顺序存储的有序表；哈希 O(1) 但需额外空间且不支持范围查询。
7. **STL 中 lower_bound / upper_bound 的实现原理**：本质就是上述二分变体，需理解并能手动实现。
