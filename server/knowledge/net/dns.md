# DNS 域名系统

## DNS 概述

DNS（Domain Name System）是互联网的"电话簿"，负责将人类可读的域名（如 `www.example.com`）转换为机器使用的 IP 地址（如 `93.184.216.34`）。DNS 运行在 UDP 之上（端口 53，长报文切换到 TCP），是应用层协议。

DNS 采用分布式、层次化的数据库结构，没有单一服务器保存所有记录，而是分散在全球数百万台 DNS 服务器上。

## 域名层级结构

域名从右向左层级递增，用点分隔：

```
www.example.com.
   |    |      |  |
   |    |      |  └── 根域（root，常省略尾点）
   |    |      └───── 顶级域 TLD（Top-Level Domain）
   |    └──────────── 二级域 SLD
   └───────────────── 三级域 / 主机名
```

层级分类：

- **根域**：全球 13 组根服务器（A-M），由 ICANN 管理。
- **顶级域（TLD）**：
  - 通用顶级域：.com / .org / .net / .edu / .gov
  - 国家顶级域：.cn / .us / .jp / .uk
  - 新通用顶级域：.app / .dev / .xyz
- **二级域**：组织注册的域名，如 `example.com`。
- **子域/主机**：组织内部进一步划分，如 `mail.example.com`、`www.example.com`。

## DNS 解析过程

浏览器输入 `www.example.com` 后的解析流程：

1. **浏览器缓存**：先查浏览器自身 DNS 缓存。
2. **操作系统缓存**：再查 OS 缓存与 `hosts` 文件。
3. **本地解析器（Stub Resolver）**：向配置的本地 DNS 服务器（如运营商或公共 DNS 8.8.8.8）发起查询。
4. **递归查询**：本地 DNS 若未命中，依次：
   - 查询**根域名服务器**，获取 TLD 服务器地址；
   - 查询**顶级域服务器**（.com），获取权威服务器地址；
   - 查询**权威服务器**（example.com），获取最终 IP。
5. **返回结果**：本地 DNS 把 IP 返回给客户端，并缓存一段时间（按 TTL）。

### 递归查询 vs 迭代查询

- **递归查询**：客户端向本地 DNS 请求，本地 DNS 必须给出最终答案，自己代为向其他服务器询问。客户端→本地 DNS 这一段是递归。
- **迭代查询**：本地 DNS 向根/权威查询时，对方只返回"下一步去问谁"，本地 DNS 继续逐级追问。本地 DNS↔根/权威这一段是迭代。

## DNS 记录类型

DNS 数据库中以"资源记录（RR）"形式存储信息。常见类型：

| 类型 | 含义 | 示例 |
|------|------|------|
| A | 域名 → IPv4 地址 | `www.example.com. A 93.184.216.34` |
| AAAA | 域名 → IPv6 地址 | `www.example.com. AAAA 2606:2800::` |
| CNAME | 别名指向另一个域名 | `blog.example.com. CNAME example.github.io.` |
| MX | 邮件交换服务器，带优先级 | `example.com. MX 10 mail.example.com.` |
| NS | 该域的权威服务器 | `example.com. NS ns1.example.com.` |
| TXT | 任意文本，用于 SPF、DKIM、域名验证 | `example.com. TXT "v=spf1 -all"` |
| SOA | 起始授权，记录主权威服务器与管理员邮箱、序列号等 | |
| PTR | IP → 域名（反向解析） | `34.216.184.93.in-addr.arpa. PTR www.example.com.` |
| SRV | 服务定位（端口+权重） | `_xmpp-server._tcp.example.com. SRV ...` |

## 报文结构

DNS 报文由首部 + 问题/回答/授权/附加四个区组成。首部 12 字节，关键字段：

- Transaction ID：用于匹配请求与响应。
- Flags：QR（查询/响应）、Opcode、AA（权威回答）、TC（截断）、RD（期望递归）、RA（递归可用）、RCODE（响应码）。
- 问题数、回答数、授权数、附加数。

## 缓存与 TTL

DNS 大量使用缓存以减轻根与权威服务器压力。每条记录带 TTL（生存时间），过期前可复用，过期后必须重新查询。TTL 是缓存一致性与查询效率的权衡。

## 代码示例：DNS 查询

```python
import socket

# 简单方式：直接解析
ip = socket.gethostbyname('www.example.com')
print('A 记录:', ip)

# 完整方式：使用 dnspython
try:
    import dns.resolver
    answers = dns.resolver.resolve('example.com', 'MX')
    for rdata in answers:
        print(f'MX {rdata.preference} {rdata.exchange}')
except ImportError:
    print('请先 pip install dnspython')
```

使用 `dig` 命令调试：

```bash
dig www.example.com            # 查询 A 记录
dig @8.8.8.8 example.com MX   # 指定 DNS 服务器查 MX
dig example.com NS +short      # 简短输出
dig -x 8.8.8.8                 # 反向解析
```

## 常见考点

1. DNS 的层次结构及各层职责。
2. 递归查询与迭代查询的区别及各自发生位置。
3. 完整的 DNS 解析流程（从浏览器到权威服务器）。
4. 常见记录类型 A/AAAA/CNAME/MX/NS/TXT 的含义。
5. DNS 为什么使用 UDP 而非 TCP（小报文、低延迟；超长切换 TCP）。
6. TTL 的作用及对缓存一致性的影响。
7. DNS 缓存层级：浏览器 / OS / 本地解析器 / 各级权威。
8. DNS 劫持与 DNSSEC 的作用。
9. 反向解析与 PTR 记录的应用场景。
10. 本地 `hosts` 文件优先级为何高于 DNS 查询。
