# 树与二叉树

## 概念定义

**树（Tree）** 是一种层次型数据结构，由 n（n≥0）个节点组成的有限集合。当 n=0 时为空树；否则有一个根节点，其余节点分成若干互不相交的子树。

**二叉树（Binary Tree）** 是每个节点最多有两个子节点（左、右）的树。

## 核心要点

### 1. 二叉树性质

- 第 i 层最多有 2^(i-1) 个节点（根为第 1 层）。
- 深度为 k 的二叉树最多有 2^k - 1 个节点。
- 叶子数 n0 = 度为 2 的节点数 n2 + 1，即 n0 = n2 + 1。
- 完全二叉树：除最后一层外全满，最后一层从左到右连续。
- 满二叉树：每层都达到最大节点数。

### 2. 二叉树遍历

- **前序**：根 → 左 → 右
- **中序**：左 → 根 → 右（BST 中序为升序）
- **后序**：左 → 右 → 根
- **层序**：按层从上到下、从左到右（BFS，借助队列）

前序 + 中序，或后序 + 中序，可以唯一确定一棵二叉树。

### 3. 二叉搜索树（BST）

左子树所有节点 < 根 < 右子树所有节点。查找、插入、删除平均 O(log n)，最坏 O(n)（退化为链）。

### 4. 平衡二叉树（AVL）

任意节点左右子树高度差 ≤ 1，通过 LL、RR、LR、RL 四种旋转保持平衡。查找/插入/删除均为 O(log n)。

### 5. 堆（Heap）

- **最大堆**：父节点 ≥ 子节点；**最小堆**：父节点 ≤ 子节点。
- 堆是完全二叉树，通常用数组存储：节点 i 的父节点为 `(i-1)/2`，左孩子 `2i+1`，右孩子 `2i+2`。
- 应用：优先队列、Top-K、堆排序（O(n log n)）。

## 代码示例

### C 语言：二叉树三种遍历

```c
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int val;
    struct Node *left, *right;
} Node;

Node* newNode(int v) {
    Node *p = (Node*)malloc(sizeof(Node));
    p->val = v; p->left = p->right = NULL;
    return p;
}

void preOrder(Node *t)  { if (!t) return; printf("%d ", t->val); preOrder(t->left);  preOrder(t->right); }
void inOrder(Node *t)   { if (!t) return; inOrder(t->left);  printf("%d ", t->val); inOrder(t->right);  }
void postOrder(Node *t) { if (!t) return; postOrder(t->left); postOrder(t->right); printf("%d ", t->val); }

int main() {
    /*       1
            /   \
           2     3
          / \
         4   5            */
    Node *root = newNode(1);
    root->left = newNode(2);
    root->right = newNode(3);
    root->left->left = newNode(4);
    root->left->right = newNode(5);

    preOrder(root);  printf("\n");   // 1 2 4 5 3
    inOrder(root);   printf("\n");   // 4 2 5 1 3
    postOrder(root); printf("\n");   // 4 5 2 3 1
    return 0;
}
```

### Python：BST 插入与查找

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class BST:
    def __init__(self):
        self.root = None

    def insert(self, val):
        def _insert(node, val):
            if not node: return TreeNode(val)
            if val < node.val: node.left = _insert(node.left, val)
            elif val > node.val: node.right = _insert(node.right, val)
            return node
        self.root = _insert(self.root, val)

    def search(self, val):
        node = self.root
        while node:
            if val == node.val: return True
            node = node.left if val < node.val else node.right
        return False

    def inorder(self):
        res = []
        def dfs(n):
            if not n: return
            dfs(n.left); res.append(n.val); dfs(n.right)
        dfs(self.root)
        return res

# 最小堆示例
import heapq
data = [5, 2, 8, 1, 9]
heapq.heapify(data)            # 建堆 O(n)
print(heapq.heappop(data))     # 1（最小值）
heapq.heappush(data, 0)
print(data[0])                 # 0（堆顶）
```

## 常见考点

1. **二叉树性质计算**：n0 = n2 + 1；完全二叉树节点数与深度的关系 `⌊log2 n⌋ + 1`。
2. **三种遍历递归与非递归**：非递归前/中序用栈，后序较难，层序用队列。
3. **由遍历序列重建二叉树**：前序找根，中序分左右，递归构造。
4. **BST 删除节点**：分无子、一子、两子三种情况；两子时找右子树最小值替换。
5. **AVL 旋转**：四种失衡情况（LL/RR/LR/RL）及对应旋转方式，常考调整后的树形。
6. **堆的调整**：上浮（插入）、下沉（删除）；建堆时间复杂度 O(n) 而非 O(n log n)。
7. **堆排序**：建最大堆，每次把堆顶与末尾交换，堆大小减一后下沉。
8. **递归求树高/节点数**：`height = max(h(left), h(right)) + 1`。
9. **哈夫曼树**：带权路径长度最短的树，用于哈夫曼编码；n 个叶子合并 n-1 次。

树是数据结构的核心章节，二叉树、BST、AVL、堆都是高频考点，需熟练掌握遍历与平衡原理。
