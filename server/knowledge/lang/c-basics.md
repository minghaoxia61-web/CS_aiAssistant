# C语言基础

## 概述

C 语言是一种通用的、面向过程的高级编程语言，由 Dennis Ritchie 于 1972 年在贝尔实验室开发。它是现代编程语言的基石，操作系统（Linux/Windows）、嵌入式系统和高性能计算中广泛使用。

## 核心特性

- **简洁高效**：仅 32 个关键字，直接操作内存，运行效率接近汇编
- **可移植性强**：标准库统一，跨平台编译即可运行
- **底层控制**：支持指针操作，直接访问物理内存地址
- **结构化编程**：函数为基本模块，支持模块化设计

## 数据类型

```c
#include <stdio.h>
#include <string.h>

int main() {
    // 基本数据类型
    int a = 42;           // 整型 4字节
    char c = 'A';         // 字符 1字节
    float f = 3.14f;      // 单精度浮点 4字节
    double d = 3.14159;   // 双精度浮点 8字节
    long l = 100000L;     // 长整型 8字节

    // 数组
    int arr[5] = {1, 2, 3, 4, 5};

    // 字符串（字符数组）
    char str[] = "Hello, C!";

    printf("a = %d, c = %c, d = %.5f\n", a, c, d);
    printf("arr[2] = %d\n", arr[2]);
    printf("str = %s, len = %zu\n", str, strlen(str));

    return 0;
}
```

## 指针

指针是 C 语言的核心特性，存储变量的内存地址。

```c
#include <stdio.h>

void swap(int *a, int *b) {
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

int main() {
    int x = 10, y = 20;
    printf("交换前: x=%d, y=%d\n", x, y);

    swap(&x, &y);  // 传递地址
    printf("交换后: x=%d, y=%d\n", x, y);

    // 指针与数组
    int arr[] = {10, 20, 30};
    int *p = arr;  // 数组名即首元素地址
    for (int i = 0; i < 3; i++) {
        printf("arr[%d] = %d (via ptr: %d)\n", i, arr[i], *(p + i));
    }

    return 0;
}
```

## 动态内存分配

```c
#include <stdio.h>
#include <stdlib.h>

int main() {
    int n = 5;
    // malloc 分配内存（不初始化）
    int *arr = (int *)malloc(n * sizeof(int));
    if (arr == NULL) {
        printf("内存分配失败\n");
        return 1;
    }

    for (int i = 0; i < n; i++) {
        arr[i] = i * 10;
    }

    // calloc 分配并初始化为 0
    int *zeros = (int *)calloc(n, sizeof(int));

    // realloc 调整大小
    arr = (int *)realloc(arr, 10 * sizeof(int));

    // 使用完毕必须释放
    free(arr);
    free(zeros);

    return 0;
}
```

## 结构体

```c
#include <stdio.h>
#include <string.h>

struct Student {
    char name[50];
    int age;
    float gpa;
};

// typedef 简化类型名
typedef struct {
    int x;
    int y;
} Point;

int main() {
    struct Student s1;
    strcpy(s1.name, "张三");
    s1.age = 20;
    s1.gpa = 3.8;

    Point p1 = {3, 4};
    Point *ptr = &p1;

    printf("%s, %d岁, GPA: %.1f\n", s1.name, s1.age, s1.gpa);
    printf("Point: (%d, %d)\n", ptr->x, ptr->y);

    return 0;
}
```

## 常见考点

1. **指针与数组的关系**：数组名退化为指针，`a[i]` 等价于 `*(a+i)`
2. **函数指针**：`int (*func)(int, int)` — 用于回调函数和函数表
3. **内存泄漏**：`malloc` 后未 `free`，或 `realloc` 后原指针失效
4. **作用域与生命周期**：`static` 局部变量在函数调用间保持值
5. **预处理指令**：`#define`、`#include`、条件编译 `#ifdef`
6. **位运算**：`&`、`|`、`^`、`~`、`<<`、`>>` — 常用于底层优化
