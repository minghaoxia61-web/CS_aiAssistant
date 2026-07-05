# Python基础

## 概述

Python 是一种高级、解释型、动态类型编程语言，由 Guido van Rossum 于 1989 年开发。以简洁的语法和强大的标准库著称，广泛应用于数据科学、AI、Web 开发和自动化脚本。

## 核心特性

- **简洁易读**：缩进定义代码块，无需花括号和分号
- **动态类型**：变量无需声明类型，运行时自动推断
- **垃圾回收**：引用计数 + 分代回收，无需手动管理内存
- **丰富的标准库**：os/sys/json/re/datetime 等开箱即用

## 数据类型

```python
# 基本类型
x = 42                  # int（任意精度）
y = 3.14159             # float
name = "Alice"          # str
flag = True             # bool
nothing = None          # NoneType

# 容器类型
lst = [1, 2, 3, "a"]    # list（可变）
tpl = (1, 2, 3)         # tuple（不可变）
st = {1, 2, 3}          # set（无序不重复）
d = {"name": "Bob", "age": 20}  # dict（键值对）

# 列表推导式
squares = [x**2 for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]

print(f"{name}: lst={lst}, dict={d}")
print(f"squares[:5] = {squares[:5]}")
```

## 函数

```python
def greet(name: str, greeting: str = "Hello") -> str:
    """带类型注解和默认参数的函数"""
    return f"{greeting}, {name}!"

# 可变参数
def sum_all(*args, **kwargs):
    total = sum(args)
    print(f"kwargs: {kwargs}")
    return total

# Lambda 表达式
double = lambda x: x * 2
numbers = [1, 2, 3, 4, 5]
doubled = list(map(lambda x: x * 2, numbers))

print(greet("World"))
print(sum_all(1, 2, 3, 4, tag="test"))
print(doubled)
```

## 面向对象

```python
class Animal:
    """基类"""
    count = 0  # 类变量

    def __init__(self, name: str, age: int):
        self.name = name    # 实例变量
        self.age = age
        Animal.count += 1

    def speak(self) -> str:
        return f"{self.name} makes a sound"

    def __str__(self):
        return f"Animal({self.name}, {self.age})"

class Dog(Animal):
    """继承 Animal"""
    def __init__(self, name: str, age: int, breed: str):
        super().__init__(name, age)
        self.breed = breed

    def speak(self) -> str:  # 方法重写
        return f"{self.name} says: Woof!"

dog = Dog("Rex", 3, "Labrador")
print(dog.speak())      # Rex says: Woof!
print(dog)               # Animal(Rex, 3)
print(f"Total animals: {Animal.count}")
```

## 文件与异常处理

```python
import json

def read_config(filepath: str) -> dict:
    """安全读取 JSON 配置文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"文件不存在: {filepath}")
        return {}
    except json.JSONDecodeError as e:
        print(f"JSON 解析失败: {e}")
        return {}
    except Exception as e:
        print(f"未知错误: {e}")
        return {}
    finally:
        print("读取操作完成")

# 上下文管理器自动关闭文件
with open('output.txt', 'w', encoding='utf-8') as f:
    f.write("Hello, Python!\n")
```

## 常见考点

1. **可变 vs 不可变类型**：list/dict/set 可变，int/str/tuple 不可变 — 函数传参行为不同
2. **浅拷贝 vs 深拷贝**：`copy.copy()` vs `copy.deepcopy()` — 嵌套对象的复制差异
3. **GIL（全局解释器锁）**：CPython 中同一时刻只有一个线程执行字节码 — 多线程无法利用多核
4. **装饰器**：`@decorator` 语法糖 — 在不修改原函数的情况下增加功能
5. **生成器**：`yield` 关键字 — 惰性计算，节省内存
6. **列表 vs 元组**：列表可变（增删改），元组不可变（可作为字典键）
