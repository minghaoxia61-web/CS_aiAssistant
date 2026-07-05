# 事务

## 概述

事务（Transaction）是数据库操作的逻辑单元，由一条或多条 SQL 语句组成。事务保证这些操作要么全部成功，要么全部失败回滚。

## ACID 特性

| 特性 | 含义 | 说明 |
|---|---|---|
| **A**tomicity（原子性） | 不可分割 | 事务中的操作全部执行或全部不执行 |
| **C**onsistency（一致性） | 数据一致 | 事务前后数据库满足完整性约束 |
| **I**solation（隔离性） | 并行隔离 | 并发事务之间互不干扰 |
| **D**urability（持久性） | 永久保存 | 事务提交后数据持久化到磁盘 |

## 事务操作

```sql
-- MySQL 事务示例：转账
START TRANSACTION;

-- 张三转出 100 元
UPDATE accounts SET balance = balance - 100 WHERE name = '张三';

-- 李四转入 100 元
UPDATE accounts SET balance = balance + 100 WHERE name = '李四';

-- 检查张三余额是否足够
SELECT balance FROM accounts WHERE name = '张三';

-- 如果余额为负，回滚
-- ROLLBACK;

-- 否则提交
COMMIT;
```

## 隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 性能 |
|---|---|---|---|---|
| READ UNCOMMITTED | ✗ | ✗ | ✗ | 最高 |
| READ COMMITTED | ✓ | ✗ | ✗ | 高 |
| REPEATABLE READ | ✓ | ✓ | ✗ | 中 |
| SERIALIZABLE | ✓ | ✓ | ✓ | 最低 |

- **脏读**：读到其他事务未提交的数据
- **不可重复读**：同一事务两次读取同一行，结果不同（其他事务修改了）
- **幻读**：同一事务两次查询，结果集行数不同（其他事务插入/删除了）

```sql
-- 设置隔离级别
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- MySQL 默认隔离级别为 REPEATABLE READ
-- 通过 MVCC（多版本并发控制）实现，读不加锁
```

## 常见考点

1. **redo log vs undo log**：redo log 保证持久性（崩溃恢复），undo log 保证原子性（回滚）
2. **MVCC**：多版本并发控制，每行数据有版本号，读操作不阻塞写操作
3. **锁机制**：行锁/表锁、共享锁（S锁）/排他锁（X锁）、意向锁
4. **死锁**：两个事务互相等待对方释放锁 — 检测超时后回滚代价较小的事务
5. **两阶段锁协议**：扩展阶段（加锁）+ 收缩阶段（解锁），无法避免死锁但可保证可串行化
