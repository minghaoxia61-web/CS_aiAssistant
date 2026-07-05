# 哈希表

## 概念定义

**哈希表（Hash Table）**，又称散列表，是根据关键字（key）直接进行访问的数据结构。它通过**哈希函数**把 key 映射到数组下标位置，从而实现接近 O(1) 的查找、插入和删除。

## 核心要点

### 1. 哈希函数

哈希函数 `h(key)` 将 key 映射到 `[0, m-1]` 的整数。常见构造方法：

- **直接定址法**：`h(key) = a * key + b`，无冲突但要求 key 范围连续。
- **除留余数法**：`h(key) = key % p`，p 通常取不大于表长的最大质数，最常用。
- **数字分析法**、**平方取中法**、**折叠法**：根据 key 特点选取。

好的哈希函数应满足：分布均匀、计算简单、冲突少。

### 2. 冲突处理

不同 key 可能映射到同一地址，称为**冲突**。常见处理方法：

- **拉链法（链地址法）**：每个桶挂一个链表，冲突元素追加到链表。删除方便，装填因子可大于 1。Java 的 HashMap 即用此法。
- **开放寻址法**：冲突时按规则寻找下一个空位。
  - 线性探测：`+1, +2, +3 ...`
  - 二次探测：`+1², -1², +2², -2² ...`
  - 双重散列：用第二个哈希函数计算步长。
- 开放寻址删除需标记"已删除"（墓碑），否则会断开探测链。

### 3. 负载因子

**负载因子（Load Factor）α = 元素个数 / 表长**，反映哈希表装满程度。

- 拉链法 α 可 > 1，但越大查找越慢。
- 开放寻址法 α 必须 < 1，通常控制在 0.7 以下。
- α 过大时触发**扩容**：申请更大表（通常 2 倍），把所有元素重新哈希（rehash）插入。

### 4. 扩容与再哈希

当 α 超过阈值时扩容。扩容代价 O(n)，但均摊到每次插入仍为 O(1)。扩容时所有 key 需用新表长重新计算位置，称为 **rehash**。

## 代码示例

### C 语言：拉链法实现

```c
#include <stdio.h>
#include <stdlib.h>

#define M 7

typedef struct Node {
    int key;
    struct Node *next;
} Node;

Node *table[M];

int hash(int key) { return (key % M + M) % M; }

void insert(int key) {
    int h = hash(key);
    Node *p = (Node*)malloc(sizeof(Node));
    p->key = key;
    p->next = table[h];
    table[h] = p;
}

Node* search(int key) {
    Node *p = table[hash(key)];
    while (p) {
        if (p->key == key) return p;
        p = p->next;
    }
    return NULL;
}

void del(int key) {
    int h = hash(key);
    Node *p = table[h], *prev = NULL;
    while (p) {
        if (p->key == key) {
            if (prev) prev->next = p->next;
            else      table[h] = p->next;
            free(p);
            return;
        }
        prev = p; p = p->next;
    }
}

int main() {
    int a[] = {15, 22, 8, 12, 29};
    for (int i = 0; i < 5; i++) insert(a[i]);
    printf("%d\n", search(22) != NULL);   // 1
    del(22);
    printf("%d\n", search(22) != NULL);   // 0
    return 0;
}
```

### Python：开放寻址法（线性探测）

```python
class HashTable:
    def __init__(self, size=8):
        self.size = size
        self.table = [None] * size
        self.count = 0

    def _hash(self, key):
        return hash(key) % self.size

    def _load_factor(self):
        return self.count / self.size

    def _resize(self, new_size):
        old = self.table
        self.size = new_size
        self.table = [None] * new_size
        self.count = 0
        for item in old:
            if item is not None:
                self.insert(item[0], item[1])

    def insert(self, key, value):
        if self._load_factor() > 0.7:
            self._resize(self.size * 2)
        idx = self._hash(key)
        while self.table[idx] is not None:
            if self.table[idx][0] == key:   # 已存在则更新
                self.table[idx] = (key, value)
                return
            idx = (idx + 1) % self.size
        self.table[idx] = (key, value)
        self.count += 1

    def get(self, key):
        idx = self._hash(key)
        while self.table[idx] is not None:
            if self.table[idx][0] == key:
                return self.table[idx][1]
            idx = (idx + 1) % self.size
        raise KeyError(key)

ht = HashTable()
ht.insert("name", "Tom")
ht.insert("age", 20)
print(ht.get("name"))   # Tom
print(ht.get("age"))    # 20
```

## 常见考点

1. **平均时间复杂度 O(1)**：在哈希函数均匀、冲突较少时，查找/插入/删除期望 O(1)，最坏 O(n)（所有 key 冲突）。
2. **拉链法 vs 开放寻址法**：拉链法删除简单、α 可 > 1；开放寻址法空间紧凑、缓存友好，但删除需墓碑标记。
3. **冲突产生原因**：key 范围远大于表长，无法完全避免，只能减少。
4. **除留余数法中 p 选质数**：避免 key 有公共因子时冲突集中。
5. **线性探测的"堆积"（聚集）问题**：连续占用块变长，查找效率下降；二次探测、双重散列可缓解。
6. **负载因子阈值**：Java HashMap 默认 0.75，超过即扩容；扩容后需 rehash。
7. **扩容均摊 O(1)**：单次 rehash O(n)，但摊还到每次插入为 O(1)。
8. **一致性哈希**：分布式场景下减少节点变动时的数据迁移，常考概念。
9. **哈希表 vs 搜索树**：哈希表无序、O(1) 查找；搜索树有序、O(log n) 查找，支持范围查询。

哈希表是工程中最常用的数据结构之一，理解哈希函数、冲突处理、负载因子与扩容是核心，也是面试与考研的高频考点。
