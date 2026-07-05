// 知识库分类目录
export interface KnowledgeArticle {
  slug: string
  category: string
  categoryName: string
  title: string
  order: number
}

export const CATEGORIES = [
  { id: 'ds', name: '数据结构', icon: 'database' },
  { id: 'algo', name: '算法', icon: 'zap' },
  { id: 'lang', name: '编程语言', icon: 'code' },
  { id: 'os', name: '操作系统', icon: 'cpu' },
  { id: 'net', name: '计算机网络', icon: 'globe' },
  { id: 'db', name: '数据库', icon: 'table' },
]

export const CATALOG: KnowledgeArticle[] = [
  // 数据结构
  { slug: 'ds/array-linkedlist', category: 'ds', categoryName: '数据结构', title: '数组与链表', order: 1 },
  { slug: 'ds/stack-queue', category: 'ds', categoryName: '数据结构', title: '栈与队列', order: 2 },
  { slug: 'ds/tree', category: 'ds', categoryName: '数据结构', title: '树与二叉树', order: 3 },
  { slug: 'ds/graph', category: 'ds', categoryName: '数据结构', title: '图', order: 4 },
  { slug: 'ds/hash-table', category: 'ds', categoryName: '数据结构', title: '哈希表', order: 5 },
  // 算法
  { slug: 'algo/sorting', category: 'algo', categoryName: '算法', title: '排序算法', order: 1 },
  { slug: 'algo/searching', category: 'algo', categoryName: '算法', title: '搜索算法', order: 2 },
  { slug: 'algo/dp', category: 'algo', categoryName: '算法', title: '动态规划', order: 3 },
  { slug: 'algo/greedy', category: 'algo', categoryName: '算法', title: '贪心算法', order: 4 },
  { slug: 'algo/divide-conquer', category: 'algo', categoryName: '算法', title: '分治算法', order: 5 },
  // 编程语言
  { slug: 'lang/c-basics', category: 'lang', categoryName: '编程语言', title: 'C语言基础', order: 1 },
  { slug: 'lang/python-basics', category: 'lang', categoryName: '编程语言', title: 'Python基础', order: 2 },
  { slug: 'lang/java-basics', category: 'lang', categoryName: '编程语言', title: 'Java基础', order: 3 },
  // 操作系统
  { slug: 'os/process-thread', category: 'os', categoryName: '操作系统', title: '进程与线程', order: 1 },
  { slug: 'os/memory', category: 'os', categoryName: '操作系统', title: '内存管理', order: 2 },
  { slug: 'os/file-system', category: 'os', categoryName: '操作系统', title: '文件系统', order: 3 },
  { slug: 'os/io', category: 'os', categoryName: '操作系统', title: 'IO模型', order: 4 },
  // 计算机网络
  { slug: 'net/osi-tcpip', category: 'net', categoryName: '计算机网络', title: 'OSI与TCP-IP模型', order: 1 },
  { slug: 'net/http', category: 'net', categoryName: '计算机网络', title: 'HTTP与HTTPS', order: 2 },
  { slug: 'net/tcp-udp', category: 'net', categoryName: '计算机网络', title: 'TCP与UDP', order: 3 },
  { slug: 'net/dns', category: 'net', categoryName: '计算机网络', title: 'DNS域名系统', order: 4 },
  // 数据库
  { slug: 'db/sql', category: 'db', categoryName: '数据库', title: 'SQL基础', order: 1 },
  { slug: 'db/index', category: 'db', categoryName: '数据库', title: '索引', order: 2 },
  { slug: 'db/transaction', category: 'db', categoryName: '数据库', title: '事务', order: 3 },
  { slug: 'db/normalization', category: 'db', categoryName: '数据库', title: '数据库范式', order: 4 },
]
