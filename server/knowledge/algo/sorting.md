# 排序算法

排序是计算机科学中最基础、最重要的算法之一，它将一组无序的数据按照某种规则（升序或降序）重新排列。排序算法不仅是各类考试的高频考点，也是理解算法设计思想（如分治、贪心）的重要载体。掌握各种排序算法的时间复杂度、空间复杂度及稳定性，是计科专业学生的必备能力。

## 概念定义

排序算法（Sorting Algorithm）是指将一组数据按照特定顺序进行排列的算法。根据算法是否在原地进行，可分为内部排序（数据全部装入内存）和外部排序（数据量过大需借助外存）。本文主要讨论内部排序。

- **稳定性**：若排序前后具有相同关键字的记录相对次序不变，则称该排序算法是稳定的，否则为不稳定。
- **原地排序**：算法只需 O(1) 的额外空间即可完成排序。

## 核心要点

### 常见排序算法对比

| 算法 | 平均时间 | 最坏时间 | 最好时间 | 空间复杂度 | 稳定性 |
| --- | --- | --- | --- | --- | --- |
| 冒泡排序 | O(n²) | O(n²) | O(n) | O(1) | 稳定 |
| 选择排序 | O(n²) | O(n²) | O(n²) | O(1) | 不稳定 |
| 插入排序 | O(n²) | O(n²) | O(n) | O(1) | 稳定 |
| 快速排序 | O(n log n) | O(n²) | O(n log n) | O(log n) | 不稳定 |
| 归并排序 | O(n log n) | O(n log n) | O(n log n) | O(n) | 稳定 |
| 堆排序 | O(n log n) | O(n log n) | O(n log n) | O(1) | 不稳定 |

### 算法特点简述

- **冒泡排序**：相邻元素两两比较，每轮将最大（小）元素"冒泡"到末尾。可加 `flag` 优化提前退出。
- **选择排序**：每轮在未排序区中选出最小元素放到已排序区末尾。交换可能破坏稳定性。
- **插入排序**：将待排序元素插入已排序序列的合适位置，对近乎有序的数据效率极高。
- **快速排序**：选取基准（pivot），将小于基准的元素放左、大于的放右，再递归处理左右子区间。最坏情况发生在数组已有序且基准选择不当时。
- **归并排序**：递归地将数组对半分割，再合并两个有序子数组。
- **堆排序**：先构建大顶堆，然后将堆顶元素与末尾交换，调整堆，重复 n-1 次。

## 代码示例

### 冒泡排序（C）

```c
void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        int flag = 0;  // 优化：若本轮无交换则已有序
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                int tmp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = tmp;
                flag = 1;
            }
        }
        if (flag == 0) break;
    }
}
```

### 快速排序（C）

```c
int partition(int arr[], int low, int high) {
    int pivot = arr[high];  // 选末尾为基准
    int i = low - 1;
    for (int j = low; j < high; j++) {
        if (arr[j] < pivot) {
            i++;
            int tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
    }
    int tmp = arr[i + 1]; arr[i + 1] = arr[high]; arr[high] = tmp;
    return i + 1;
}

void quickSort(int arr[], int low, int high) {
    if (low < high) {
        int p = partition(arr, low, high);
        quickSort(arr, low, p - 1);
        quickSort(arr, p + 1, high);
    }
}
```

### 归并排序（Python）

```python
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i]); i += 1
        else:
            result.append(right[j]); j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
```

### 堆排序（C）

```c
void heapify(int arr[], int n, int i) {
    int largest = i;
    int l = 2 * i + 1, r = 2 * i + 2;
    if (l < n && arr[l] > arr[largest]) largest = l;
    if (r < n && arr[r] > arr[largest]) largest = r;
    if (largest != i) {
        int tmp = arr[i]; arr[i] = arr[largest]; arr[largest] = tmp;
        heapify(arr, n, largest);
    }
}

void heapSort(int arr[], int n) {
    for (int i = n / 2 - 1; i >= 0; i--)  // 建堆
        heapify(arr, n, i);
    for (int i = n - 1; i > 0; i--) {
        int tmp = arr[0]; arr[0] = arr[i]; arr[i] = tmp;
        heapify(arr, i, 0);
    }
}
```

## 常见考点

1. **时间/空间复杂度分析**：能写出各算法在最好、最坏、平均情况下的复杂度，并能解释最坏情况的成因（例如快排退化）。
2. **稳定性判断**：常考哪些排序稳定、哪些不稳定，以及为何不稳定（如选择排序中跨越式交换会改变相等元素的相对次序）。
3. **快排的优化**：三数取中法选基准、随机化基准、小数组改用插入排序、尾递归优化等。
4. **归并排序求逆序对**：在合并阶段统计逆序对，复杂度 O(n log n)，是经典面试题。
5. **Top K 问题**：用堆（优先队列）解决，构建大小为 K 的堆，时间复杂度 O(n log K)。
6. **手写代码**：冒泡、插入、快排、归并是最常被要求手写的算法，需熟练掌握。
7. **应用场景选择**：小规模或近乎有序数据用插入排序；大规模数据用快排或归并；内存受限场景用堆排序；要求稳定排序时用归并排序。
