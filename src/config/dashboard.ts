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

export interface Chain {
  id: string;
  name: string;
  icon: string;
  segments: { name: string; desc: string; stocks: ChainStock[] }[];
  tech: string[];
  keywords: string[];
}

export const CHAINS: Chain[] = [
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
      },
    ],
    tech: ["EUV光刻", "先进封装 Chiplet", "HBM 高带宽存储", "SiC/GaN 第三代半导体", "EDA 国产化", "RISC-V"],
    keywords: ["半导体", "芯片", "晶圆", "光刻", "存储", "封测", "中芯", "台积电", "EDA", "先进封装", "碳化硅", "氮化镓"],
  },
  {
    id: "ai",
    name: "AI算力",
    icon: "◉",
    segments: [
      {
        name: "上游 · 芯片与光模块",
        desc: "GPU/ASIC · 光通信器件",
        stocks: [
          { code: "sh688041", name: "海光信息", tag: "国产CPU/DCU" },
          { code: "sh688256", name: "寒武纪", tag: "AI ASIC" },
          { code: "sz300308", name: "中际旭创", tag: "光模块龙头" },
          { code: "sz300502", name: "新易盛", tag: "高速光模块" },
          { code: "sz300394", name: "天孚通信", tag: "光器件" },
        ],
      },
      {
        name: "中游 · 服务器与IDC",
        desc: "AI服务器 · 数据中心",
        stocks: [
          { code: "sh601138", name: "工业富联", tag: "AI服务器" },
          { code: "sz000977", name: "浪潮信息", tag: "服务器龙头" },
          { code: "sh603019", name: "中科曙光", tag: "高性能计算" },
          { code: "sz300383", name: "光环新网", tag: "IDC服务" },
          { code: "sz002261", name: "拓维信息", tag: "昇腾生态" },
        ],
      },
      {
        name: "下游 · 云与应用",
        desc: "云计算 · AI应用",
        stocks: [
          { code: "sh688111", name: "金山办公", tag: "AI办公" },
          { code: "sz002230", name: "科大讯飞", tag: "语音大模型" },
          { code: "sh601360", name: "三六零", tag: "AI搜索" },
          { code: "sz300418", name: "昆仑万维", tag: "AGI应用" },
          { code: "sz300624", name: "万兴科技", tag: "AI创意" },
        ],
      },
    ],
    tech: ["国产 GPU", "CPO 光电共封装", "液冷数据中心", "推理加速", "万卡集群", "AI Agent"],
    keywords: ["AI", "算力", "大模型", "英伟达", "GPU", "服务器", "光模块", "数据中心", "液冷", "智能体", "推理"],
  },
  {
    id: "ev",
    name: "新能源车",
    icon: "◍",
    segments: [
      {
        name: "上游 · 锂矿与材料",
        desc: "锂/钴资源 · 正负极/隔膜",
        stocks: [
          { code: "sz002466", name: "天齐锂业", tag: "锂矿" },
          { code: "sz002460", name: "赣锋锂业", tag: "锂盐" },
          { code: "sh603799", name: "华友钴业", tag: "钴镍" },
          { code: "sz002812", name: "恩捷股份", tag: "隔膜" },
          { code: "sz002738", name: "中矿资源", tag: "锂铯铷" },
        ],
      },
      {
        name: "中游 · 电池与电机",
        desc: "动力电池 · 电驱系统",
        stocks: [
          { code: "sz300750", name: "宁德时代", tag: "电池龙头" },
          { code: "sz002594", name: "比亚迪", tag: "垂直整合" },
          { code: "sz300014", name: "亿纬锂能", tag: "动力/储能" },
          { code: "sz002074", name: "国轩高科", tag: "磷酸铁锂" },
          { code: "sz300207", name: "欣旺达", tag: "消费/动力" },
        ],
      },
      {
        name: "下游 · 整车与充电",
        desc: "整车制造 · 充换电网络",
        stocks: [
          { code: "sz000625", name: "长安汽车", tag: "自主品牌" },
          { code: "sh601633", name: "长城汽车", tag: "SUV/皮卡" },
          { code: "sz300001", name: "特锐德", tag: "充电网" },
          { code: "sh600733", name: "北汽蓝谷", tag: "新能源整车" },
          { code: "sh601127", name: "赛力斯", tag: "智选车" },
        ],
      },
    ],
    tech: ["固态电池", "800V 高压平台", "一体化压铸", "城市 NOA 智驾", "兆瓦超充", "V2G 车网互动"],
    keywords: ["锂电", "电池", "新能源", "宁德", "比亚迪", "充电", "固态电池", "电动车", "锂矿", "储能"],
  },
  {
    id: "robot",
    name: "机器人",
    icon: "◎",
    segments: [
      {
        name: "上游 · 核心零部件",
        desc: "减速器/丝杠 · 传感器/电机",
        stocks: [
          { code: "sh688017", name: "绿的谐波", tag: "谐波减速器" },
          { code: "sz002472", name: "双环传动", tag: "精密齿轮" },
          { code: "sh603728", name: "鸣志电器", tag: "空心杯电机" },
          { code: "sh603662", name: "柯力传感", tag: "力传感器" },
          { code: "sz300580", name: "贝斯特", tag: "滚柱丝杠" },
        ],
      },
      {
        name: "中游 · 本体与执行器",
        desc: "机器人本体 · 执行器总成",
        stocks: [
          { code: "sz002747", name: "埃斯顿", tag: "工业机器人" },
          { code: "sz300124", name: "汇川技术", tag: "伺服系统" },
          { code: "sz002050", name: "三花智控", tag: "执行器" },
          { code: "sh601689", name: "拓普集团", tag: "线性执行器" },
          { code: "sz300660", name: "江苏雷利", tag: "微特电机" },
        ],
      },
      {
        name: "下游 · 整机与场景",
        desc: "人形/服务机器人 · 场景集成",
        stocks: [
          { code: "sz300024", name: "机器人", tag: "新松机器人" },
          { code: "sh603666", name: "亿嘉和", tag: "特种机器人" },
          { code: "sh689009", name: "九号公司", tag: "移动机器人" },
          { code: "sh688169", name: "石头科技", tag: "服务机器人" },
          { code: "sh603486", name: "科沃斯", tag: "扫地机器人" },
        ],
      },
    ],
    tech: ["人形机器人", "谐波减速器", "行星滚柱丝杠", "灵巧手", "具身智能大模型", "六维力传感"],
    keywords: ["机器人", "人形", "减速器", "丝杠", "灵巧手", "具身", "Optimus", "Figure", "伺服"],
  },
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
      },
    ],
    tech: ["ADC 偶联药物", "GLP-1 减重", "双特异性抗体", "细胞基因治疗 CGT", "License-out 出海", "AI 制药"],
    keywords: ["创新药", "医药", "药明", "恒瑞", "ADC", "GLP", "疫苗", "临床", "License", "CXO", "靶点", "双抗"],
  },
];

/** 宏观关键词 — 快讯高亮 */
export const MACRO_KEYWORDS = [
  "央行", "美联储", "降息", "加息", "降准", "GDP", "CPI", "PMI",
  "财政部", "国债", "专项债", "汇率", "人民币", "关税", "国常会",
];
