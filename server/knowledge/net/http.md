# HTTP 与 HTTPS

## HTTP 概述

HTTP（HyperText Transfer Protocol）是应用层协议，基于请求-响应模型，默认端口 80，通常运行在 TCP 之上。它是无状态的（不保存客户端状态），可通过 Cookie/Session 维持会话。

HTTP 是文本协议，每行以 CRLF（`\r\n`）结尾，消息可读性强，便于调试。

## HTTP 请求方法

| 方法 | 含义 | 幂等 | 安全 |
|------|------|------|------|
| GET | 获取资源 | 是 | 是 |
| POST | 提交数据，创建资源 | 否 | 否 |
| PUT | 更新/替换资源 | 是 | 否 |
| DELETE | 删除资源 | 是 | 否 |
| PATCH | 部分更新 | 否 | 否 |
| HEAD | 只获取响应头 | 是 | 是 |
| OPTIONS | 查询服务器支持的方法 | 是 | 是 |

- **幂等**：多次执行结果相同。
- **安全**：不修改服务器资源。

GET 与 POST 的区别：GET 参数放在 URL 中，有长度限制，可被缓存、收藏；POST 参数在请求体中，无长度限制，不缓存。

## HTTP 状态码

状态码为三位数字，分为五类：

| 类别 | 含义 | 典型 |
|------|------|------|
| 1xx | 信息性 | 100 Continue |
| 2xx | 成功 | 200 OK, 201 Created, 204 No Content |
| 3xx | 重定向 | 301 永久重定向, 302 临时重定向, 304 Not Modified |
| 4xx | 客户端错误 | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 405 Method Not Allowed |
| 5xx | 服务端错误 | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout |

## 请求与响应格式

请求报文：

```
POST /api/login HTTP/1.1
Host: www.example.com
Content-Type: application/json
Content-Length: 36

{"username":"tom","password":"123"}
```

响应报文：

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 27

{"code":0,"msg":"success"}
```

请求行/状态行后跟若干首部字段（键值对），空行分隔首部与主体。常见首部：`Host`、`User-Agent`、`Accept`、`Cookie`、`Authorization`、`Cache-Control`、`Connection: keep-alive`。

## HTTPS 加密流程

HTTPS = HTTP + TLS/SSL，默认端口 443。HTTPS 综合使用**非对称加密**协商密钥、**对称加密**传输数据、**数字证书**验证身份、**散列**保证完整性。

简化握手流程：

1. **ClientHello**：客户端发送支持的 TLS 版本、加密套件、随机数 ClientRandom。
2. **ServerHello**：服务器选择套件，返回 ServerRandom 与证书（含公钥）。
3. **证书验证**：客户端用 CA 公钥校验证书签名，确认服务器身份。
4. **密钥交换**：客户端生成 PreMasterSecret，用服务器公钥加密发送（或使用 ECDHE 协商）。
5. **生成会话密钥**：双方用 ClientRandom + ServerRandom + PreMasterSecret 派生出对称密钥。
6. **Finished**：双方互发加密的完成消息，握手结束。
7. **应用数据传输**：使用对称密钥（如 AES-GCM）加密通信。

数字证书由 CA（证书颁发机构）签名，证书链：根 CA → 中间 CA → 服务器证书。浏览器内置根 CA 公钥，可逐级验证签名。

## HTTP/2 特性

HTTP/2 基于 SPDY，主要改进：

- **二进制分帧**：将数据拆为二进制帧，不再是文本协议。
- **多路复用**：一个 TCP 连接上并行多个请求/响应，解决 HTTP/1.1 的队头阻塞。
- **首部压缩**：HPACK 算法压缩重复首部。
- **服务端推送**：服务器可主动推送资源到客户端缓存。
- **流优先级**：可设置请求优先级。

## HTTP/3 简介

HTTP/3 基于 QUIC（UDP 之上的可靠传输协议），不再依赖 TCP，进一步消除队头阻塞，提升弱网性能，0-RTT 建连。

## 代码示例：Python 简易 HTTP 服务器

```python
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.end_headers()
        self.wfile.write('你好, HTTP!'.encode('utf-8'))

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 8080), Handler)
    print('Serving on http://localhost:8080')
    server.serve_forever()
```

## 常见考点

1. GET 与 POST 的区别（语义、参数位置、幂等性）。
2. 常见状态码含义，301 与 302 的区别。
3. HTTP 无状态如何理解，Cookie、Session、Token 的关系。
4. HTTPS 握手过程，为什么用混合加密而非单一加密。
5. 对称加密与非对称加密的区别及各自适用场景。
6. 证书链与 CA 信任模型。
7. HTTP/1.1 的 keep-alive 与 HTTP/2 多路复用的区别。
8. 跨域（CORS）原理及处理方式。
9. 常见首部字段的作用：`Cache-Control`、`ETag`、`If-None-Match`。
