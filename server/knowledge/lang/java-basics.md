# Java基础

## 概述

Java 是一种面向对象、跨平台的高级编程语言，由 Sun Microsystems（现 Oracle）于 1995 年发布。其核心理念是"一次编写，到处运行"（Write Once, Run Anywhere），通过 JVM（Java 虚拟机）实现跨平台。

## 核心特性

- **面向对象**：封装、继承、多态
- **跨平台**：编译为字节码，JVM 解释执行
- **自动内存管理**：JVM 垃圾回收（GC），无需手动释放
- **强类型**：编译时类型检查
- **多线程**：内置线程支持

## 基本语法

```java
public class HelloWorld {
    public static void main(String[] args) {
        // 基本数据类型
        int a = 42;
        double d = 3.14159;
        boolean flag = true;
        char c = 'A';

        // 字符串
        String name = "Alice";
        System.out.println("Hello, " + name + "!");

        // 数组
        int[] arr = {1, 2, 3, 4, 5};
        for (int i = 0; i < arr.length; i++) {
            System.out.println("arr[" + i + "] = " + arr[i]);
        }

        // 增强for循环
        for (int num : arr) {
            System.out.print(num + " ");
        }
    }
}
```

## 面向对象

```java
// 抽象类
abstract class Animal {
    protected String name;
    protected int age;

    public Animal(String name, int age) {
        this.name = name;
        this.age = age;
    }

    // 抽象方法，子类必须实现
    public abstract String speak();

    // 普通方法
    public String getInfo() {
        return name + " (" + age + "岁)";
    }
}

// 接口
interface Swimmer {
    void swim();
}

// 继承 + 接口实现
class Dog extends Animal implements Swimmer {
    private String breed;

    public Dog(String name, int age, String breed) {
        super(name, age);  // 调用父类构造器
        this.breed = breed;
    }

    @Override
    public String speak() {
        return name + " says: Woof!";
    }

    @Override
    public void swim() {
        System.out.println(name + " is swimming");
    }

    public String getBreed() {
        return breed;
    }
}

public class Main {
    public static void main(String[] args) {
        Dog dog = new Dog("Rex", 3, "Labrador");
        System.out.println(dog.speak());     // 多态
        System.out.println(dog.getInfo());   // 继承父类方法
        dog.swim();                          // 接口方法
    }
}
```

## 集合框架

```java
import java.util.*;

public class CollectionsDemo {
    public static void main(String[] args) {
        // List — 有序可重复
        List<String> list = new ArrayList<>();
        list.add("Apple");
        list.add("Banana");
        list.add(0, "Cherry");

        // Set — 无序不重复
        Set<Integer> set = new HashSet<>();
        set.add(1); set.add(2); set.add(1);  // 实际只有2个元素

        // Map — 键值对
        Map<String, Integer> map = new HashMap<>();
        map.put("Alice", 90);
        map.put("Bob", 85);

        // 遍历
        for (Map.Entry<String, Integer> entry : map.entrySet()) {
            System.out.println(entry.getKey() + ": " + entry.getValue());
        }

        // 泛型方法
        List<Integer> numbers = Arrays.asList(3, 1, 4, 1, 5, 9);
        Collections.sort(numbers);
        System.out.println(numbers);
    }
}
```

## 常见考点

1. **JVM 内存模型**：堆（对象）、栈（方法栈帧）、方法区（类信息）、程序计数器
2. **GC 机制**：新生代（Eden/Survivor）+ 老年代，标记-清除/标记-复制/标记-整理
3. **接口 vs 抽象类**：接口多实现、无状态；抽象类单继承、可有成员变量
4. **多态实现**：编译时重载（Overload）+ 运行时重写（Override，动态分派）
5. **异常体系**：Checked Exception（编译时检查）vs Unchecked Exception（RuntimeException）
6. **泛型擦除**：编译后泛型类型被擦除为 Object — 运行时无法获取泛型类型
7. **String 不可变性**：String 不可变，StringBuilder 可变（线程不安全），StringBuffer 可变（线程安全）
