/** 板块数据适配层
 *  腾讯板块接口有两个口径: t=01 行业(申万二级) / t=02 概念。
 *  这里统一做归一化: 打口径标签(kind)、生成规范名(cname,去 Ⅱ/Ⅲ 后缀与空白),
 *  供板块热点面板与产业链面板共用同一套匹配/去重规则,避免口径混用。
 */
import { api, type Board } from "./api";

export type BoardKind = "industry" | "concept";

export interface NormBoard extends Board {
  /** 口径: 行业(t=01) / 概念(t=02) */
  kind: BoardKind;
  /** 归一化名称: 去掉 Ⅱ/Ⅲ 与空白, 用于跨口径匹配 */
  cname: string;
}

export const canonBoardName = (name: string) => name.replace(/[ⅡⅢ\s]/g, "");

export function normalizeBoard(b: Board, kind: BoardKind): NormBoard {
  return { ...b, kind, cname: canonBoardName(b.name) };
}

/** 行业+概念双口径合并(领涨/领跌双向), 按 code 去重;
 *  归一化后同名时行业口径优先(与板块热点面板"行业"tab 一致)。 */
export async function unionBoards(n = 40): Promise<NormBoard[]> {
  const [indUp, indDown, conUp, conDown] = await Promise.all([
    api.boards("01", 0, n),
    api.boards("01", 1, n),
    api.boards("02", 0, n),
    api.boards("02", 1, n),
  ]);
  const byCode = new Map<string, NormBoard>();
  const push = (list: Board[], kind: BoardKind) => {
    for (const b of list) if (!byCode.has(b.code)) byCode.set(b.code, normalizeBoard(b, kind));
  };
  // 行业在前: 同名归一时保留行业口径
  push(indUp, "industry");
  push(indDown, "industry");
  push(conUp, "concept");
  push(conDown, "concept");
  const seenName = new Set<string>();
  const out: NormBoard[] = [];
  for (const nb of byCode.values()) {
    if (seenName.has(nb.cname)) continue;
    seenName.add(nb.cname);
    out.push(nb);
  }
  return out;
}
