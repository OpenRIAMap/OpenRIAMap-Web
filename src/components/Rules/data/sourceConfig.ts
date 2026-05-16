/**
 * Rules 数据源基础配置。
 * - pub：沿用 public 目录下的旧数据与旧图片
 * - dat：读取 Data 仓库；远端源头由“源数据仓库链接模式”动态决定。
 */
import {
  resolveOpenRIAMapDataMergeBaseUrl,
  resolveOpenRIAMapPictureBaseUrl,
} from './sourceLinkModes';

export const RULE_SOURCE_ROOTS = {
  pub: {
    dataBaseUrl: '/data/JSON',
    pictureBaseUrl: '/pictures',
  },
} as const;

export function getRuleDataMergeBaseUrl(): string {
  return resolveOpenRIAMapDataMergeBaseUrl();
}

export function getRuleDataPictureBaseUrl(): string {
  return resolveOpenRIAMapPictureBaseUrl();
}
