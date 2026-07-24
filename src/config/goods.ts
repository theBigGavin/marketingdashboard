/** 商品价格页品种配置: 期货主力连续合约(新浪 nf_/hf_ 代码) */

export type GoodsGroupId = "pm" | "bm" | "fer" | "chem" | "agri" | "intl";

export interface GoodsGroup {
  id: GoodsGroupId;
  name: string;
  accent: string;
}

export interface GoodsDef {
  /** 内部代码(新浪连续合约后缀), 如 "AU0" */
  code: string;
  /** 新浪行情代码, 如 "nf_AU0" / "hf_GC" */
  sina: string;
  name: string;
  group: GoodsGroupId;
  unit: string;
}

export const GOODS_GROUPS: GoodsGroup[] = [
  { id: "pm", name: "贵金属 · 国际金", accent: "#f5c542" },
  { id: "bm", name: "基本金属", accent: "#38bdf8" },
  { id: "fer", name: "黑色系", accent: "#94a3b8" },
  { id: "chem", name: "能源化工", accent: "#fb923c" },
  { id: "agri", name: "农产品", accent: "#4ade80" },
  { id: "intl", name: "国际能源", accent: "#f472b6" },
];

export const GOODS: GoodsDef[] = [
  // 贵金属 · 国际金
  { code: "AU0", sina: "nf_AU0", name: "沪金", group: "pm", unit: "元/克" },
  { code: "AG0", sina: "nf_AG0", name: "沪银", group: "pm", unit: "元/千克" },
  { code: "GC", sina: "hf_GC", name: "COMEX黄金", group: "pm", unit: "美元/盎司" },
  { code: "SI", sina: "hf_SI", name: "COMEX白银", group: "pm", unit: "美元/盎司" },
  { code: "XAU", sina: "hf_XAU", name: "伦敦金", group: "pm", unit: "美元/盎司" },
  // 基本金属
  { code: "CU0", sina: "nf_CU0", name: "沪铜", group: "bm", unit: "元/吨" },
  { code: "AL0", sina: "nf_AL0", name: "沪铝", group: "bm", unit: "元/吨" },
  { code: "ZN0", sina: "nf_ZN0", name: "沪锌", group: "bm", unit: "元/吨" },
  { code: "NI0", sina: "nf_NI0", name: "沪镍", group: "bm", unit: "元/吨" },
  { code: "SN0", sina: "nf_SN0", name: "沪锡", group: "bm", unit: "元/吨" },
  { code: "LC0", sina: "nf_LC0", name: "碳酸锂", group: "bm", unit: "元/吨" },
  { code: "SI0", sina: "nf_SI0", name: "工业硅", group: "bm", unit: "元/吨" },
  { code: "CAD", sina: "hf_CAD", name: "LME伦铜", group: "bm", unit: "美元/吨" },
  // 黑色系
  { code: "RB0", sina: "nf_RB0", name: "螺纹钢", group: "fer", unit: "元/吨" },
  { code: "HC0", sina: "nf_HC0", name: "热轧卷板", group: "fer", unit: "元/吨" },
  { code: "I0", sina: "nf_I0", name: "铁矿石", group: "fer", unit: "元/吨" },
  { code: "J0", sina: "nf_J0", name: "焦煤", group: "fer", unit: "元/吨" },
  { code: "JM0", sina: "nf_JM0", name: "焦炭", group: "fer", unit: "元/吨" },
  // 能源化工
  { code: "SC0", sina: "nf_SC0", name: "INE原油", group: "chem", unit: "元/桶" },
  { code: "FU0", sina: "nf_FU0", name: "燃油", group: "chem", unit: "元/吨" },
  { code: "BU0", sina: "nf_BU0", name: "沥青", group: "chem", unit: "元/吨" },
  { code: "TA0", sina: "nf_TA0", name: "PTA", group: "chem", unit: "元/吨" },
  { code: "MA0", sina: "nf_MA0", name: "甲醇", group: "chem", unit: "元/吨" },
  { code: "PP0", sina: "nf_PP0", name: "聚丙烯", group: "chem", unit: "元/吨" },
  { code: "V0", sina: "nf_V0", name: "PVC", group: "chem", unit: "元/吨" },
  { code: "RU0", sina: "nf_RU0", name: "橡胶", group: "chem", unit: "元/吨" },
  // 农产品
  { code: "M0", sina: "nf_M0", name: "豆粕", group: "agri", unit: "元/吨" },
  { code: "Y0", sina: "nf_Y0", name: "豆油", group: "agri", unit: "元/吨" },
  { code: "P0", sina: "nf_P0", name: "棕榈油", group: "agri", unit: "元/吨" },
  { code: "C0", sina: "nf_C0", name: "玉米", group: "agri", unit: "元/吨" },
  { code: "SR0", sina: "nf_SR0", name: "白糖", group: "agri", unit: "元/吨" },
  { code: "CF0", sina: "nf_CF0", name: "棉花", group: "agri", unit: "元/吨" },
  // 国际能源
  { code: "CL", sina: "hf_CL", name: "WTI原油", group: "intl", unit: "美元/桶" },
  { code: "NG", sina: "hf_NG", name: "NYMEX天然气", group: "intl", unit: "美元/百万英热" },
];

/** 全部品种的新浪代码(批量实时报价用) */
export const ALL_GOODS_SINA = GOODS.map((g) => g.sina);

/** 交易所简称(生意社现期表) */
export const EXCH_SHORT: Record<string, string> = {
  上海期货交易所: "上期所",
  大连商品交易所: "大商所",
  郑州商品交易所: "郑商所",
  广州期货交易所: "广期所",
  上海国际能源交易中心: "上能所",
};

/** 化工现货(生意社报价中心, id 为其商品 ID; 代表价=市场价中位数) */
export interface ChemSpotDef {
  id: string;
  name: string;
  unit: string;
}

export const CHEM_SPOTS: ChemSpotDef[] = [
  { id: "7250", name: "碳酸亚乙烯酯", unit: "元/吨" },
];
