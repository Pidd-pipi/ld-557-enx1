/** 金额/权重/数量舍入工具，保证内存态计算结果稳定 */
export function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function round6(value: number): number {
  return Number(value.toFixed(6));
}
