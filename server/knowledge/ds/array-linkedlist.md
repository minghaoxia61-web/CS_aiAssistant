# 数组与链表

## 概念定义

**数组（Array）** 是一种线性数据结构，采用顺序存储方式，在内存中占用一段连续的空间，通过下标可以直接访问任意元素。

**链表（Linked List）** 是一种采用链式存储的线性数据结构，元素（节点）在内存中不必连续，每个节点包含数据域和指针域，通过指针链接下一个节点。

## 核心要点

### 1. 顺序存储 vs 链式存储

| 特性 | 数组 | 链表 |
| --- | --- | --- |
| 内存 | 连续 | 不连续 |
| 随机访问 | O(1) | O(n) |
| 插入/删除（已知位置） | O(n) | O(1) |
| 空间开销 | 仅数据 | 额外指针 |
| 大小 | 固定（静态数组） | 动态 |

### 2. 时间复杂度对比

- 数组：访问 O(1)，查找 O(n)，插入 O(n)，删除 O(n)
- 链表：访问 O(n)，查找 O(n)，插入 O(1)，删除 O(1)（已知节点位置时）

### 3. 动态数组

静态数组大小固定，动态数组（如 C++ 的 vector、Python 的 list）在容量不足时自动扩容：通常申请一块更大的连续空间（如 2 倍），把旧元素复制过去。均摊插入时间为 O(1)。

### 4. 单链表与双链表

- **单链表**：每个节点只含指向后继的指针，只能单向遍历。
- **双链表**：每个节点含前驱和后继两个指针，可双向遍历，删除给定节点更方便，但空间开销更大。

## 代码示例

### C 语言：单链表头插法与遍历

```c
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int data;
    struct Node *next;
} Node;

Node* insertHead(Node *head, int val) {
    Node *p = (Node*)malloc(sizeof(Node));
    p->data = val;
    p->next = head;
    return p;
}

void printList(Node *head) {
    while (head) {
        printf("%d -> ", head->data);
        head = head->next;
    }
    printf("NULL\n");
}

int main() {
    Node *head = NULL;
    head = insertHead(head, 3);
    head = insertHead(head, 2);
    head = insertHead(head, 1);
    printList(head);   // 1 -> 2 -> 3 -> NULL
    return 0;
}
```

### Python：动态数组与链表对比

```python
# 动态数组（Python list 自带扩容）
arr = [1, 2, 3]
arr.append(4)         # 均摊 O(1)
print(arr[0])         # O(1) 随机访问

# 单链表实现
class Node:
    def __init__(self, val=0, nxt=None):
        self.val = val
        self.next = nxt

class LinkedList:
    def __init__(self):
        self.head = None

    def insert_head(self, val):
        self.head = Node(val, self.head)

    def reverse(self):
        prev, cur = None, self.head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev, cur = cur, nxt
        self.head = prev

    def print(self):
        p = self.head
        while p:
            print(p.val, end=" -> ")
            p = p.next
        print("None")

ll = LinkedList()
for v in [3, 2, 1]:
    ll.insert_head(v)
ll.print()      # 1 -> 2 -> 3 -> None
ll.reverse()
ll.print()      # 3 -> 2 -> 1 -> None
```

## 常见考点

1. **随机访问时间复杂度**：数组 O(1)，链表 O(n)，这是二者最核心区别。
2. **频繁插入删除选链表，频繁查询选数组**。
3. **动态数组扩容代价**：单次扩容 O(n)，但均摊 O(1)；扩容倍数影响空间利用率。
4. **单链表反转**：经典面试题，要求掌握迭代法和递归法。
5. **双链表删除节点**：需要同时修改前驱和后继的指针，注意边界（头/尾节点）。
6. **缓存友好性**：数组由于内存连续，对 CPU 缓存更友好，实际运行往往比理论复杂度更快。
7. **静态数组与动态数组**：C 中数组大小不可变，需用 `malloc`/`realloc` 实现动态数组。

掌握数组与链表的差异，是理解后续栈、队列、哈希表等数据结构的基础。
