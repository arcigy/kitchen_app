export type ReleaseNewsLanguage = "en" | "cs" | "sk";

export type LocalizedText = Record<ReleaseNewsLanguage, string>;

export type ReleaseNotice = {
  id: string;
  date: string;
  title: LocalizedText;
  summary: LocalizedText;
  changes: LocalizedText[];
  tryIt: LocalizedText[];
};

export type ReleaseNewsResponse = {
  notices: ReleaseNotice[];
  acknowledgedNoticeIds: string[];
};
