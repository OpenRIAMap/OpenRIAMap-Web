/**
 * Rules 数据源基础配置。
 * - pub：沿用 public 目录下的旧数据与旧图片
 * - dat：读取 Data 仓库（默认按 GitHub raw 地址配置，可按部署情况自行改）
 */
export const RULE_SOURCE_ROOTS = {
  pub: {
    dataBaseUrl: '/data/JSON',
    pictureBaseUrl: '/pictures',
  },
  dat: {
    // 请按你的 Data 仓库实际发布地址修改
    mergeBaseUrl: 'https://raw.githubusercontent.com/OpenRIAMap/OpenRIAMap-Data/main/Data_Merge',
    pictureBaseUrl: 'https://raw.githubusercontent.com/OpenRIAMap/OpenRIAMap-Data/main/Picture',
  },
} as const;
