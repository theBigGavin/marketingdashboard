/** 驾驶舱静态配置:指数、大宗商品、产业链 */

export interface IndexDef {
  code: string;
  label: string;
  region: "CN" | "HK" | "US" | "FX";
}

export const INDICES: IndexDef[] = [
  { code: "sh000001", label: "上证指数", region: "CN" },
  { code: "sz399001", label: "深证成指", region: "CN" },
  { code: "sz399006", label: "创业板指", region: "CN" },
  { code: "sh000688", label: "科创50", region: "CN" },
  { code: "sh000300", label: "沪深300", region: "CN" },
  { code: "sh000905", label: "中证500", region: "CN" },
  { code: "hkHSI", label: "恒生指数", region: "HK" },
  { code: "hkHSTECH", label: "恒生科技", region: "HK" },
  { code: "usDJI", label: "道琼斯", region: "US" },
  { code: "usIXIC", label: "纳斯达克", region: "US" },
  { code: "usINX", label: "标普500", region: "US" },
  { code: "usVIX", label: "恐慌指数", region: "US" },
  { code: "usSOXX", label: "费城半导体", region: "US" },
];

export const FOREX: IndexDef[] = [{ code: "whUSDCNY", label: "美元/人民币", region: "FX" }];

export interface CommodityDef {
  code: string;
  label: string;
  unit: string;
  accent: string;
}

export const COMMODITIES: CommodityDef[] = [
  { code: "hf_GC", label: "纽约黄金", unit: "COMEX · 美元/盎司", accent: "#f5c542" },
  { code: "hf_XAU", label: "伦敦金", unit: "现货 · 美元/盎司", accent: "#ffca28" },
  { code: "nf_AU0", label: "沪金", unit: "元/克", accent: "#e6c25a" },
  { code: "hf_SI", label: "纽约白银", unit: "COMEX · 美元/盎司", accent: "#c0d0e0" },
  { code: "hf_CAD", label: "LME伦铜", unit: "美元/吨", accent: "#e8833a" },
  { code: "hf_CL", label: "NYMEX原油", unit: "美元/桶", accent: "#5aa9e6" },
  { code: "BTCUSDT", label: "BTC/USDT", unit: "美元", accent: "#f7931a" },
];

export interface ChainStock {
  code: string;
  name: string;
  tag?: string;
}

export interface ChainSegment {
  name: string;
  desc: string;
  stocks: ChainStock[];
  query?: string;
}

export interface Chain {
  id: string;
  name: string;
  icon: string;
  segments: ChainSegment[];
  tech: string[];
  keywords: string[];
}

export const CHAINS: Chain[] = [
  /* ── 大模型 ── */
  {
    id: "llm",
    name: "大模型",
    icon: "◉",
    segments: [
      {
        name: "上游 · 算力基座",
        desc: "GPU/AI芯片 · 光模块/服务器 · 算力基础设施",
        stocks: [
          { code: "sh688041", name: "海光信息", tag: "国产DCU/GPU" },
          { code: "sh688256", name: "寒武纪", tag: "AI ASIC" },
          { code: "sz300308", name: "中际旭创", tag: "光模块龙头" },
          { code: "sh601138", name: "工业富联", tag: "AI服务器" },
          { code: "sz000977", name: "浪潮信息", tag: "服务器龙头" },
        ],
        query: "算力硬件",
      },
      {
        name: "中游 · 模型与平台",
        desc: "大模型训练/推理 · AI平台 · 数据服务",
        stocks: [
          { code: "sz002230", name: "科大讯飞", tag: "星火大模型" },
          { code: "sh601360", name: "三六零", tag: "360智脑" },
          { code: "sz300418", name: "昆仑万维", tag: "天工大模型" },
          { code: "sh688111", name: "金山办公", tag: "AI办公" },
          { code: "sz300229", name: "拓尔思", tag: "AI/大数据" },
        ],
        query: "大模型",
      },
      {
        name: "下游 · Agent与应用",
        desc: "AI Agent · 行业解决方案 · 多模态应用",
        stocks: [
          { code: "sz300624", name: "万兴科技", tag: "AI创意" },
          { code: "sz300496", name: "中科创达", tag: "AI OS" },
          { code: "sh688088", name: "虹软科技", tag: "视觉AI" },
          { code: "sh688327", name: "云从科技", tag: "人机协同" },
          { code: "sz002362", name: "汉王科技", tag: "AI交互" },
        ],
        query: "AI应用",
      },
    ],
    tech: ["MoE 混合专家", "千亿参数训练", "多模态融合", "Agent 框架", "RAG 检索增强", "端侧推理"],
    keywords: ["大模型", "AI", "人工智能", "GPT", "Transformer", "多模态", "算力", "GPU", "Agent", "智能体", "训练", "推理"],
  },

  /* ── 具身智能 ── */
  {
    id: "embodied",
    name: "具身智能",
    icon: "◎",
    segments: [
      {
        name: "上游 · 核心零部件",
        desc: "减速器/丝杠 · 传感器/电机 · 灵巧手",
        stocks: [
          { code: "sh688017", name: "绿的谐波", tag: "谐波减速器" },
          { code: "sz002472", name: "双环传动", tag: "精密齿轮" },
          { code: "sh603728", name: "鸣志电器", tag: "空心杯电机" },
          { code: "sh603662", name: "柯力传感", tag: "力传感器" },
          { code: "sz300580", name: "贝斯特", tag: "滚柱丝杠" },
        ],
        query: "减速器",
      },
      {
        name: "中游 · 整机与执行器",
        desc: "机器人本体 · 执行器总成 · 伺服系统",
        stocks: [
          { code: "sz002747", name: "埃斯顿", tag: "工业机器人" },
          { code: "sz300124", name: "汇川技术", tag: "伺服系统" },
          { code: "sz002050", name: "三花智控", tag: "执行器" },
          { code: "sh601689", name: "拓普集团", tag: "线性执行器" },
          { code: "sz300660", name: "江苏雷利", tag: "微特电机" },
        ],
        query: "伺服系统",
      },
      {
        name: "下游 · 大脑与场景",
        desc: "具身大模型 · 人形/服务/特种机器人 · 场景集成",
        stocks: [
          { code: "sz300024", name: "机器人", tag: "新松机器人" },
          { code: "sh603666", name: "亿嘉和", tag: "特种机器人" },
          { code: "sh689009", name: "九号公司", tag: "移动机器人" },
          { code: "sh688169", name: "石头科技", tag: "服务机器人" },
          { code: "sh603486", name: "科沃斯", tag: "扫地机器人" },
        ],
        query: "人形机器人",
      },
    ],
    tech: ["人形机器人", "谐波减速器", "行星滚柱丝杠", "灵巧手", "具身智能大模型", "六维力传感", "Sim-to-Real"],
    keywords: ["具身智能", "人形机器人", "减速器", "丝杠", "灵巧手", "Optimus", "Figure", "伺服", "传感器"],
  },

  /* ── 半导体 ── */
  {
    id: "semi",
    name: "半导体",
    icon: "◈",
    segments: [
      {
        name: "上游 · 设备与材料",
        desc: "光刻/刻蚀/薄膜沉积 · 硅片/光刻胶",
        stocks: [
          { code: "sz002371", name: "北方华创", tag: "设备龙头" },
          { code: "sh688012", name: "中微公司", tag: "刻蚀设备" },
          { code: "sh688126", name: "沪硅产业", tag: "大硅片" },
          { code: "sz002409", name: "雅克科技", tag: "电子材料" },
          { code: "sh688037", name: "芯源微", tag: "涂胶显影" },
        ],
        query: "半导体设备",
      },
      {
        name: "中游 · 制造与封测",
        desc: "晶圆代工 · 封装测试",
        stocks: [
          { code: "sh688981", name: "中芯国际", tag: "代工龙头" },
          { code: "sh688347", name: "华虹公司", tag: "特色工艺" },
          { code: "sh600584", name: "长电科技", tag: "封测龙头" },
          { code: "sz002156", name: "通富微电", tag: "先进封装" },
          { code: "sh688249", name: "晶合集成", tag: "晶圆代工" },
        ],
        query: "晶圆代工",
      },
      {
        name: "下游 · 设计与应用",
        desc: "芯片设计 · 终端应用",
        stocks: [
          { code: "sh603501", name: "韦尔股份", tag: "CIS图像" },
          { code: "sz300782", name: "卓胜微", tag: "射频前端" },
          { code: "sh603986", name: "兆易创新", tag: "存储/MCU" },
          { code: "sh688256", name: "寒武纪", tag: "AI芯片" },
          { code: "sh688008", name: "澜起科技", tag: "内存接口" },
        ],
        query: "芯片设计",
      },
    ],
    tech: ["EUV光刻", "先进封装 Chiplet", "HBM 高带宽存储", "SiC/GaN 第三代半导体", "EDA 国产化", "RISC-V"],
    keywords: ["半导体", "芯片", "晶圆", "光刻", "存储", "封测", "中芯", "台积电", "EDA", "先进封装", "碳化硅", "氮化镓"],
  },

  /* ── 新能源 ── */
  {
    id: "newenergy",
    name: "新能源",
    icon: "◍",
    segments: [
      {
        name: "上游 · 资源与材料",
        desc: "锂/钴资源 · 硅料/硅片 · 风电材料",
        stocks: [
          { code: "sz002466", name: "天齐锂业", tag: "锂矿" },
          { code: "sz002460", name: "赣锋锂业", tag: "锂盐" },
          { code: "sh603799", name: "华友钴业", tag: "钴镍" },
          { code: "sh600438", name: "通威股份", tag: "硅料龙头" },
          { code: "sh601012", name: "隆基绿能", tag: "硅片龙头" },
        ],
        query: "光伏材料",
      },
      {
        name: "中游 · 电池与电力设备",
        desc: "动力/储能电池 · 逆变器 · 风机 · 氢能",
        stocks: [
          { code: "sz300750", name: "宁德时代", tag: "电池龙头" },
          { code: "sz002594", name: "比亚迪", tag: "垂直整合" },
          { code: "sz300014", name: "亿纬锂能", tag: "动力/储能" },
          { code: "sz300274", name: "阳光电源", tag: "逆变器龙头" },
          { code: "sz002202", name: "金风科技", tag: "风电龙头" },
        ],
        query: "动力电池",
      },
      {
        name: "下游 · 运营与整车",
        desc: "新能源整车 · 充电/换电 · 电站运营",
        stocks: [
          { code: "sz000625", name: "长安汽车", tag: "自主品牌" },
          { code: "sh601127", name: "赛力斯", tag: "智选车" },
          { code: "sz300001", name: "特锐德", tag: "充电网" },
          { code: "sh600905", name: "三峡能源", tag: "新能源运营" },
          { code: "sh600406", name: "国电南瑞", tag: "电网自动化" },
        ],
        query: "新能源整车",
      },
    ],
    tech: ["固态电池", "钙钛矿光伏", "800V高压平台", "城市NOA智驾", "V2G车网互动", "氢燃料电池"],
    keywords: ["新能源", "光伏", "风电", "锂电", "储能", "电池", "充电", "宁德", "比亚迪", "电动车", "逆变器", "氢能"],
  },

  /* ── 创新药 ── */
  {
    id: "pharma",
    name: "创新药",
    icon: "◬",
    segments: [
      {
        name: "上游 · CXO与原料",
        desc: "研发外包 · 原料药",
        stocks: [
          { code: "sh603259", name: "药明康德", tag: "CXO龙头" },
          { code: "sz300347", name: "泰格医药", tag: "临床CRO" },
          { code: "sz002821", name: "凯莱英", tag: "CDMO" },
          { code: "sh603127", name: "昭衍新药", tag: "安评CRO" },
          { code: "sz300759", name: "康龙化成", tag: "一体化CXO" },
        ],
        query: "CXO",
      },
      {
        name: "中游 · 创新药企",
        desc: "创新管线 · 国际化",
        stocks: [
          { code: "sh600276", name: "恒瑞医药", tag: "创新药龙头" },
          { code: "sh688235", name: "百济神州", tag: "国际化标杆" },
          { code: "hk01801", name: "信达生物", tag: "PD-1/双抗" },
          { code: "sz002422", name: "科伦药业", tag: "ADC管线" },
          { code: "sh688266", name: "泽璟制药", tag: "小分子新药" },
        ],
        query: "创新药",
      },
      {
        name: "下游 · 商业化与流通",
        desc: "疫苗/流通 · 药房零售",
        stocks: [
          { code: "sz300122", name: "智飞生物", tag: "疫苗代理" },
          { code: "sh601607", name: "上海医药", tag: "工商业一体" },
          { code: "sz000028", name: "国药一致", tag: "医药流通" },
          { code: "sh603939", name: "益丰药房", tag: "连锁药房" },
          { code: "sh600998", name: "九州通", tag: "医药流通" },
        ],
        query: "疫苗",
      },
    ],
    tech: ["ADC 偶联药物", "GLP-1 减重", "双特异性抗体", "细胞基因治疗 CGT", "License-out 出海", "AI 制药"],
    keywords: ["创新药", "医药", "药明", "恒瑞", "ADC", "GLP", "疫苗", "临床", "License", "CXO", "靶点", "双抗"],
  },

  /* ── 新型工业化 ── */
  {
    id: "newindustrial",
    name: "新型工业化",
    icon: "▣",
    segments: [
      {
        name: "上游 · 工业软件与控制",
        desc: "DCS/PLC · 工业软件/CAX · 工业操作系统",
        stocks: [
          { code: "sh688777", name: "中控技术", tag: "DCS龙头" },
          { code: "sh600845", name: "宝信软件", tag: "工业软件" },
          { code: "sh600588", name: "用友网络", tag: "工业互联网" },
          { code: "sh603859", name: "能科科技", tag: "工业数字化" },
          { code: "sz300687", name: "赛意信息", tag: "智能制造" },
        ],
        query: "工业软件",
      },
      {
        name: "中游 · 智能制造装备",
        desc: "工业机器人 · 数控机床 · 自动化产线",
        stocks: [
          { code: "sz300124", name: "汇川技术", tag: "工业自动化" },
          { code: "sz002747", name: "埃斯顿", tag: "工业机器人" },
          { code: "sz300450", name: "先导智能", tag: "锂电设备" },
          { code: "sz300724", name: "捷佳伟创", tag: "光伏设备" },
          { code: "sz002595", name: "豪迈科技", tag: "精密加工" },
        ],
        query: "工业机器人",
      },
      {
        name: "下游 · 数字化与互联",
        desc: "工业互联网平台 · 数字孪生 · 智慧工厂",
        stocks: [
          { code: "sh601138", name: "工业富联", tag: "工业互联网" },
          { code: "sz300166", name: "东方国信", tag: "工业大数据" },
          { code: "sz300378", name: "鼎捷软件", tag: "智能制造" },
          { code: "sh688568", name: "中科星图", tag: "数字孪生" },
          { code: "sz002230", name: "科大讯飞", tag: "工业AI" },
        ],
        query: "工业互联网",
      },
    ],
    tech: ["工业互联网", "数字孪生", "AI质检", "柔性制造", "工业大模型", "边缘计算"],
    keywords: ["新型工业化", "工业互联网", "智能制造", "工业4.0", "工业软件", "自动化", "机器人", "数字孪生", "柔性制造"],
  },

  /* ── 数字政府 ── */
  {
    id: "digitalgov",
    name: "数字政府",
    icon: "◆",
    segments: [
      {
        name: "上游 · 云网与安全",
        desc: "政务云 · 网络安全 · 信创基础设施",
        stocks: [
          { code: "sz002368", name: "太极股份", tag: "政务云" },
          { code: "sz300454", name: "深信服", tag: "网络安全" },
          { code: "sz002439", name: "启明星辰", tag: "安全" },
          { code: "sh600536", name: "中国软件", tag: "国产OS" },
          { code: "sh603019", name: "中科曙光", tag: "政务算力" },
        ],
        query: "政务云",
      },
      {
        name: "中游 · 平台与数据",
        desc: "数字政务平台 · 数据治理 · 一网通办",
        stocks: [
          { code: "sz000938", name: "紫光股份", tag: "政务数字化" },
          { code: "sz300075", name: "数字政通", tag: "数字城管" },
          { code: "sz300525", name: "博思软件", tag: "财政信息化" },
          { code: "sh603636", name: "南威软件", tag: "数字政务" },
          { code: "sz300212", name: "易华录", tag: "数据湖" },
        ],
        query: "数字政务",
      },
      {
        name: "下游 · 智慧场景",
        desc: "智慧城市 · 智慧交通 · 智慧安防",
        stocks: [
          { code: "sz002415", name: "海康威视", tag: "安防/智慧城市" },
          { code: "sz002236", name: "大华股份", tag: "智慧城市" },
          { code: "sz300188", name: "美亚柏科", tag: "电子取证" },
          { code: "sh600728", name: "佳都科技", tag: "智慧交通" },
          { code: "sz002152", name: "广电运通", tag: "数字政务终端" },
        ],
        query: "智慧城市",
      },
    ],
    tech: ["政务大模型", "一网通办", "城市大脑", "数据要素", "隐私计算", "信创替代"],
    keywords: ["数字政府", "政务", "智慧城市", "信创", "数据要素", "网络安全", "一网通办", "城市大脑", "云"],
  },

  /* ── 智慧医疗 ── */
  {
    id: "smartmed",
    name: "智慧医疗",
    icon: "♢",
    segments: [
      {
        name: "上游 · 医疗信息化",
        desc: "HIS/EMR · 医院信息系统 · 医疗大数据",
        stocks: [
          { code: "sz300253", name: "卫宁健康", tag: "医疗IT龙头" },
          { code: "sz300451", name: "创业慧康", tag: "医疗信息化" },
          { code: "sh600718", name: "东软集团", tag: "医疗IT/HIS" },
          { code: "sz300168", name: "万达信息", tag: "智慧医疗" },
          { code: "sz300078", name: "思创医惠", tag: "医疗物联网" },
        ],
        query: "医疗信息化",
      },
      {
        name: "中游 · AI医疗与设备",
        desc: "AI诊断 · 高端影像设备 · 基因测序 · 第三方检验",
        stocks: [
          { code: "sh688271", name: "联影医疗", tag: "高端影像" },
          { code: "sz300760", name: "迈瑞医疗", tag: "医疗设备龙头" },
          { code: "sh603882", name: "金域医学", tag: "第三方检验" },
          { code: "sz300244", name: "迪安诊断", tag: "诊断服务" },
          { code: "sz300676", name: "华大基因", tag: "基因测序" },
        ],
        query: "AI医疗",
      },
      {
        name: "下游 · 互联网与健康管理",
        desc: "互联网医院 · 远程医疗 · 健康管理",
        stocks: [
          { code: "sz002603", name: "以岭药业", tag: "中药/互联网" },
          { code: "sz002044", name: "美年健康", tag: "体检/健康管理" },
          { code: "sz002223", name: "鱼跃医疗", tag: "家用医疗" },
          { code: "sz300146", name: "汤臣倍健", tag: "营养健康" },
          { code: "sh600998", name: "九州通", tag: "医药供应链" },
        ],
        query: "互联网医疗",
      },
    ],
    tech: ["AI辅助诊断", "医疗大模型", "数字病理", "远程手术", "可穿戴健康监测", "医疗数据要素"],
    keywords: ["智慧医疗", "医疗信息化", "AI医疗", "互联网医疗", "远程医疗", "健康管理", "HIS", "影像", "基因"],
  },
];

/** 宏观关键词 — 快讯高亮 */
export const MACRO_KEYWORDS = [
  "央行", "美联储", "降息", "加息", "降准", "GDP", "CPI", "PMI",
  "财政部", "国债", "专项债", "汇率", "人民币", "关税", "国常会",
];
