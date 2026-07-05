# 栈与队列

## 概念定义

**栈（Stack）** 是一种只允许在一端（栈顶）进行插入和删除的线性表，遵循 **后进先出（LIFO, Last In First Out）** 原则。

**队列（Queue）** 是只允许在一端（队尾）插入、在另一端（队头）删除的线性表，遵循 **先进先出（FIFO, First In First Out）** 原则。

## 核心要点

### 1. 栈的实现方式

- **顺序栈**：基于数组实现，用一个 `top` 指针记录栈顶位置。入栈 `++top`，出栈 `top--`。
- **链栈**：基于链表实现，头插法入栈，头删法出栈，无需预先分配空间。

栈的核心操作时间复杂度均为 O(1)。

### 2. 队列的实现方式

- **顺序队列**：基于数组，但朴素实现会出现"假溢出"——队头之前的空间无法使用。
- **循环队列**：把数组视作环形，`front` 和 `rear` 指针取模移动，充分利用空间。
  - 判空：`front == rear`
  - 判满：`(rear + 1) % size == front`（牺牲一个单元以区分空与满）
- **链队列**：基于链表，带队头和队尾指针。

### 3. 应用场景

**栈的应用**：
- 括号匹配（左括号入栈，右括号匹配栈顶）
- 表达式求值（中缀转后缀、运算符栈）
- 函数调用栈、递归实现
- 浏览器后退、撤销操作（Undo）
- 二叉树非递归遍历、图的 DFS

**队列的应用**：
- 层序遍历（BFS）
- 操作系统任务调度、打印机任务排队
- 生产者-消费者模型、消息队列

## 代码示例

### C 语言：顺序栈实现括号匹配

```c
#include <stdio.h>
#include <string.h>
#define MAX 1000

char st[MAX];
int top = -1;

void push(char c) { st[++top] = c; }
char pop()        { return st[top--]; }
int  empty()      { return top == -1; }

int isValid(char *s) {
    for (int i = 0; s[i]; i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') {
            push(c);
        } else {
            if (empty()) return 0;
            char t = pop();
            if ((c == ')' && t != '(') ||
                (c == ']' && t != '[') ||
                (c == '}' && t != '{')) return 0;
        }
    }
    return empty();
}

int main() {
    char s[] = "{[()]}";
    printf("%d\n", isValid(s));   // 1 表示合法
    return 0;
}
```

### Python：循环队列与层序遍历

```python
from collections import deque

# 循环队列（用 list 实现，固定容量）
class CircularQueue:
    def __init__(self, k):
        self.q = [0] * (k + 1)
        self.size = k + 1
        self.front = self.rear = 0

    def enqueue(self, v):
        if (self.rear + 1) % self.size == self.front:
            raise Exception("Full")
        self.q[self.rear] = v
        self.rear = (self.rear + 1) % self.size

    def dequeue(self):
        if self.front == self.rear:
            raise Exception("Empty")
        v = self.q[self.front]
        self.front = (self.front + 1) % self.size
        return v

# 二叉树层序遍历（BFS）使用队列
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def levelOrder(root):
    if not root: return []
    q = deque([root])
    res = []
    while q:
        n = len(q)
        level = []
        for _ in range(n):
            node = q.popleft()
            level.append(node.val)
            if node.left:  q.append(node.left)
            if node.right: q.append(node.right)
        res.append(level)
    return res
```

## 常见考点

1. **LIFO / FIFO 概念**：栈后进先出，队列先进先出，务必记牢。
2. **循环队列判空判满**：常考 `(rear+1)%size == front` 牺牲一个单元的写法，也考查元素个数公式 `(rear - front + size) % size`。
3. **入栈出栈序列合法性**：给定入栈顺序判断某出栈顺序是否合法（卡兰数 Catalan）。
4. **括号匹配**：栈的经典应用，注意右括号多余和左括号剩余两种错误情况。
5. **用两个栈实现队列**：一个输入栈、一个输出栈，均摊 O(1)。
6. **单调栈**：求下一个更大/更小元素，O(n) 解决，是高频面试题。
7. **循环队列 vs 链队列**：循环队列空间固定、无指针开销；链队列长度灵活但需额外指针空间。
8. **递归与栈**：递归调用本质借助函数调用栈，深度过大会栈溢出。

栈与队列是受限的线性表，掌握它们对理解递归、搜索、调度等场景至关重要。
