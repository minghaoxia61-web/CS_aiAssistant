# 文件系统

## 文件与目录

**文件**是操作系统对存储设备上数据的一种抽象，是一组带名称的相关信息的集合。文件属性包括：名称、类型、大小、创建/修改时间、权限、所有者等。

**目录**是一种特殊的文件，其内容是文件名与对应 inode 或文件位置的映射表。目录结构通常采用树形层次结构，从根目录 `/`（Linux）或盘符 `\`（Windows）出发。

## 索引节点（inode）

在 Unix/Linux 文件系统中，每个文件对应一个 **inode**（索引节点），它存储了文件的元数据：

- 文件类型与权限
- 所有者 UID/GID
- 文件大小
- 时间戳（atime/mtime/ctime）
- 数据块的磁盘地址指针（直接块、一级间接、二级间接、三级间接）
- 硬链接计数

注意：inode 不存储文件名，文件名存储在目录项中。多个文件名（硬链接）可指向同一 inode。

## 常见文件系统

### FAT（File Allocation Table）

微软早期文件系统，采用链式分配，FAT 表记录每个簇的下一个簇号。结构简单，兼容性极好（U 盘常用 FAT32），但不支持权限、日志，单文件大小受限（FAT32 最大 4GB）。

### NTFS（New Technology File System）

微软现代文件系统，采用主文件表（MFT）记录文件元数据，支持权限、压缩、加密、稀疏文件、日志（可恢复）、硬链接等特性。

### ext4（Fourth Extended Filesystem）

Linux 主流文件系统，ext 家族的第四代。特点：

- 采用 extents（区段）替代传统块指针，连续大文件高效；
- 支持日志（journaling），保证崩溃一致性；
- 支持大文件、子目录扩展、延迟分配；
- 向下兼容 ext2/ext3。

## 文件操作 API

POSIX 文件操作主要系统调用：

| 调用 | 功能 |
|------|------|
| `open(path, flags, mode)` | 打开/创建文件，返回 fd |
| `read(fd, buf, n)` | 从 fd 读取 n 字节到 buf |
| `write(fd, buf, n)` | 将 buf 的 n 字节写入 fd |
| `lseek(fd, offset, whence)` | 移动文件偏移指针 |
| `close(fd)` | 关闭文件 |
| `unlink(path)` | 删除硬链接（引用计数为 0 时释放） |
| `mkdir/rmdir` | 创建/删除目录 |
| `opendir/readdir` | 遍历目录项 |

## 代码示例：文件读写

```c
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>

int main() {
    int fd = open("hello.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) { perror("open"); return 1; }

    const char* msg = "Hello, FileSystem!\n";
    ssize_t n = write(fd, msg, strlen(msg));
    printf("写入 %zd 字节\n", n);
    close(fd);

    // 读取
    fd = open("hello.txt", O_RDONLY);
    char buf[64];
    n = read(fd, buf, sizeof(buf) - 1);
    buf[n] = '\0';
    printf("读取: %s", buf);
    close(fd);
    return 0;
}
```

## 代码示例：遍历目录

```c
#include <dirent.h>
#include <stdio.h>

int main() {
    DIR* d = opendir(".");
    struct dirent* ent;
    while ((ent = readdir(d)) != NULL) {
        printf("%s (inode=%lu)\n", ent->d_name, ent->d_ino);
    }
    closedir(d);
    return 0;
}
```

## 软链接与硬链接

- **硬链接**：多个目录项指向同一 inode，不能跨文件系统，不能链接目录。删除原文件后硬链接仍可访问数据。
- **软链接（符号链接）**：是一个独立文件，存储目标路径字符串。可跨文件系统、可链接目录，但原文件删除后成为悬空链接。

```bash
ln file.txt hardlink      # 硬链接
ln -s file.txt softlink   # 软链接
```

## 虚拟文件系统（VFS）

Linux 通过 VFS 为各种具体文件系统提供统一接口（open/read/write/close），应用程序无需关心底层是 ext4、NTFS 还是网络文件系统 NFS。VFS 四大对象：superblock、inode、dentry、file。

## 常见考点

1. inode 的内容，与目录项的关系。
2. 硬链接与软链接的区别。
3. FAT、NTFS、ext4 各自特点与适用场景。
4. 文件系统日志机制（journaling）如何保证一致性。
5. 硬盘物理结构：柱面-磁头-扇区与逻辑块地址（LBA）。
6. 文件分配方式：连续分配、链接分配、索引分配的优缺点。
7. 缓冲区与页缓存（page cache）对性能的影响。
8. `open` 返回的文件描述符与 FILE* 的区别。
