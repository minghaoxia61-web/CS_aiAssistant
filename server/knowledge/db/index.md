# 索引

## 概述

索引是数据库中用于加速查询的数据结构。类似书籍的目录，通过索引可以快速定位数据行，而无需全表扫描。

## 索引类型

### B+ 树索引（最常用）

```
         [30 | 60]                    ← 根节点（非叶子）
        /     |     \
  [10|20]  [40|50]  [70|80]          ← 中间节点
   / | \    / | \    / | \
 [10][20][30][40][50][60][70][80]    ← 叶子节点（存数据指针）
   →→→→→→→→→→→→→→→→→→→→→→→→→→        ← 叶子节点链表相连
```

- 所有数据存在叶子节点，非叶子节点只存索引
- 叶子节点通过链表相连，支持范围查询和排序
- 查询效率稳定为 O(log n)

### 哈希索引

- 基于哈希表，等值查询 O(1)
- 不支持范围查询和排序
- Memory 引擎默认使用

## 创建索引

```sql
-- 单列索引
CREATE INDEX idx_name ON students(name);

-- 复合索引（最左前缀原则）
CREATE INDEX idx_class_age ON students(class_id, age);

-- 唯一索引
CREATE UNIQUE INDEX idx_email ON users(email);

-- 查看执行计划（判断是否走索引）
EXPLAIN SELECT * FROM students WHERE class_id = 1 AND age > 18;
```

## 最左前缀原则

复合索引 `(class_id, age, grade)` 的匹配规则：

```sql
-- ✅ 走索引
SELECT * FROM students WHERE class_id = 1;
SELECT * FROM students WHERE class_id = 1 AND age = 20;
SELECT * FROM students WHERE class_id = 1 AND age = 20 AND grade = 3.8;

-- ❌ 不走索引（跳过了 class_id）
SELECT * FROM students WHERE age = 20;
SELECT * FROM students WHERE grade = 3.8;

-- ⚠️ 部分走索引（只用 class_id）
SELECT * FROM students WHERE class_id = 1 AND grade = 3.8;
```

## 何时建索引

| 适合建索引 | 不适合建索引 |
|---|---|
| 主键、外键 | 数据量小的表 |
| WHERE 条件频繁的列 | 写多读少的表 |
| JOIN 连接的列 | 区分度低的列（如性别） |
| ORDER BY / GROUP BY 的列 | 频繁更新的列 |

## 常见考点

1. **B+ 树 vs B 树**：B+ 树数据全在叶子节点 + 叶子链表相连，范围查询更高效
2. **聚簇索引 vs 非聚簇索引**：聚簇索引叶子节点存整行数据（InnoDB 主键），非聚簇索引存主键值（需回表）
3. **覆盖索引**：查询的列全部包含在索引中，无需回表
4. **索引失效场景**：`LIKE '%xxx'`、函数操作 `WHERE YEAR(date)`、隐式类型转换、`OR` 连接非索引列
5. **最左前缀原则**：复合索引从左到右匹配，跳过中间列则后续列无法使用索引
