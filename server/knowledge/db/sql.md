# SQL基础

## 概述

SQL（Structured Query Language，结构化查询语言）是用于管理关系型数据库的标准语言。几乎所有主流数据库（MySQL/PostgreSQL/SQLite/Oracle）都支持 SQL。

## 核心操作

### 建表

```sql
-- 创建学生表
CREATE TABLE students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    age INT,
    grade DECIMAL(3,2),
    class_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- 创建班级表
CREATE TABLE classes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(20) NOT NULL,
    teacher VARCHAR(50)
);
```

### 增删改查（CRUD）

```sql
-- 插入
INSERT INTO students (name, age, grade, class_id)
VALUES ('张三', 20, 3.85, 1);

-- 查询
SELECT name, age, grade FROM students
WHERE age >= 18 AND grade > 3.0
ORDER BY grade DESC
LIMIT 10;

-- 更新
UPDATE students SET grade = 3.9 WHERE name = '张三';

-- 删除
DELETE FROM students WHERE id = 5;
```

### 聚合与分组

```sql
-- 各班级平均成绩
SELECT c.name AS class_name,
       COUNT(s.id) AS student_count,
       AVG(s.grade) AS avg_grade,
       MAX(s.grade) AS max_grade,
       MIN(s.grade) AS min_grade
FROM students s
JOIN classes c ON s.class_id = c.id
GROUP BY c.name
HAVING AVG(s.grade) > 3.0
ORDER BY avg_grade DESC;
```

### 多表连接

```sql
-- INNER JOIN：只返回匹配的行
SELECT s.name, c.name AS class_name
FROM students s
INNER JOIN classes c ON s.class_id = c.id;

-- LEFT JOIN：左表全部行，右表无匹配为 NULL
SELECT s.name, c.name AS class_name
FROM students s
LEFT JOIN classes c ON s.class_id = c.id;

-- 子查询
SELECT name, grade FROM students
WHERE grade > (SELECT AVG(grade) FROM students);
```

## 常见考点

1. **JOIN 区别**：INNER（交集）/ LEFT（左全+右匹配）/ RIGHT（右全+左匹配）/ FULL（并集）
2. **WHERE vs HAVING**：WHERE 过滤行（分组前），HAVING 过滤分组（分组后）
3. **聚合函数**：COUNT/SUM/AVG/MAX/MIN，NULL 不参与计数
4. **DISTINCT**：去重，`SELECT DISTINCT class_id FROM students`
5. **索引**：WHERE/JOIN/ORDER BY 的列适合建索引
6. **事务**：BEGIN → COMMIT/ROLLBACK，保证 ACID 特性
