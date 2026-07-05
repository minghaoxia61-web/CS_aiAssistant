# I/O 模型

## 基本概念

I/O 操作通常分为两个阶段：
1. **等待数据就绪**：数据从内核缓冲区或设备到达内核空间。
2. **数据拷贝**：数据从内核空间拷贝到用户空间缓冲区。

不同的 I/O 模型在两个阶段的处理方式不同，主要区别在于第一阶段是否阻塞。

## 阻塞 I/O（Blocking I/O）

默认情况下，套接字 `read` 是阻塞的：调用后线程被挂起，直到数据就绪并拷贝完成才返回。编程简单，但单线程难以同时处理多个连接。

## 非阻塞 I/O（Non-blocking I/O）

设置 `O_NONBLOCK` 后，`read` 若无数据立即返回 `EAGAIN`/`EWOULDBLOCK`。用户可循环轮询，但 CPU 利用率低，忙等浪费资源。

## I/O 多路复用（I/O Multiplexing）

通过一个系统调用同时监听多个文件描述符，任一就绪即可处理。代表 API：`select`、`poll`、`epoll`。

### select

```c
int select(int nfds, fd_set* readfds, fd_set* writefds,
           fd_set* exceptfds, struct timeval* timeout);
```

- 监听 fd 数量受 `FD_SETSIZE` 限制（默认 1024）；
- 每次调用需将 fd 集合从用户态拷贝到内核态；
- 返回后需遍历整个集合查找就绪 fd，O(n)。

### poll

```c
int poll(struct pollfd* fds, nfds_t nfds, int timeout);
```

使用链表式结构，无最大数量限制，但仍需遍历与拷贝，性能仍随 fd 数量线性增长。

### epoll

Linux 特有，基于事件驱动：

```c
int epfd = epoll_create1(0);
struct epoll_event ev = {.events = EPOLLIN, .data.fd = listen_fd};
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);
struct epoll_event events[64];
int n = epoll_wait(epfd, events, 64, -1);
for (int i = 0; i < n; i++) {
    handle(events[i].data.fd);
}
```

- `epoll_create` 创建实例；
- `epoll_ctl` 注册/修改/删除 fd，在内核建立红黑树索引；
- `epoll_wait` 仅返回就绪 fd，O(1) 复杂度。

epoll 支持两种触发模式：
- **LT（水平触发）**：只要 fd 处于就绪状态就会持续通知，编程简单。
- **ET（边缘触发）**：状态变化时通知一次，需一次性读完所有数据，配合非阻塞 I/O 使用，效率更高但易出错。

## 异步 I/O（Asynchronous I/O）

真正的异步 I/O：用户发起请求后立即返回，内核在数据拷贝完成后通过回调或信号通知用户。Linux 下的 `io_uring`、`aio_*` 系列接口，Windows 的 IOCP 是典型实现。

注意：epoll 本质仍是同步 I/O，因为它在数据就绪后还需用户自己调用 `read` 完成拷贝。

## 五种 I/O 模型对比

| 模型 | 等待阶段 | 拷贝阶段 |
|------|----------|----------|
| 阻塞 I/O | 阻塞 | 阻塞 |
| 非阻塞 I/O | 不阻塞（轮询） | 阻塞 |
| I/O 多路复用 | 阻塞于 select | 阻塞 |
| 信号驱动 I/O | 信号通知 | 阻塞 |
| 异步 I/O | 不阻塞 | 不阻塞 |

## Reactor 模式

Reactor 是基于 I/O 多路复用的事件驱动设计模式，核心组件：

1. **Event Demultiplexer**：I/O 多路复用接口（epoll）。
2. **Reactor**：管理事件循环，分发事件给对应 handler。
3. **EventHandler**：处理具体业务逻辑。

典型流程：
```
main loop:
    events = epoll_wait()
    for event in events:
        handler = find_handler(event.fd)
        handler.on_event(event)
```

三种常见变体：
- **单 Reactor 单线程**：Redis 早期版本。
- **单 Reactor 多线程**：handler 将业务交给 worker 线程池。
- **主从 Reactor 多线程**：主 Reactor 接受连接，从 Reactor 处理 I/O，配合 worker 线程。Netty、Nginx 等采用此模式。

## 代码示例（epoll 回显服务器）

```c
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>

int main() {
    int lfd = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);
    bind(lfd, (struct sockaddr*)&addr, sizeof(addr));
    listen(lfd, 128);

    int epfd = epoll_create1(0);
    struct epoll_event ev = {.events = EPOLLIN, .data.fd = lfd};
    epoll_ctl(epfd, EPOLL_CTL_ADD, lfd, &ev);

    struct epoll_event events[64];
    char buf[512];
    while (1) {
        int n = epoll_wait(epfd, events, 64, -1);
        for (int i = 0; i < n; i++) {
            if (events[i].data.fd == lfd) {
                int cfd = accept(lfd, NULL, NULL);
                struct epoll_event cev = {.events = EPOLLIN, .data.fd = cfd};
                epoll_ctl(epfd, EPOLL_CTL_ADD, cfd, &cev);
            } else {
                int cfd = events[i].data.fd;
                int r = read(cfd, buf, sizeof(buf));
                if (r <= 0) { epoll_ctl(epfd, EPOLL_CTL_DEL, cfd, NULL); close(cfd); }
                else write(cfd, buf, r);     // 回显
            }
        }
    }
    return 0;
}
```

## 常见考点

1. 五种 I/O 模型在两个阶段是否阻塞。
2. select / poll / epoll 的区别与各自时间复杂度。
3. epoll 的 LT 与 ET 模式区别及适用场景。
4. epoll 为何高效（红黑树 + 就绪链表 + 共享内存）。
5. Reactor 与 Proactor 模式的区别。
6. 同步异步、阻塞非阻塞两组概念的本质差异。
7. `io_uring` 相对于传统 AIO 的优势。
8. 为什么说 epoll 是同步而非异步。
