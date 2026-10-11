// Legacy external API contract; the local radar no longer has a changelog UI.
export interface ChangelogRelease {
  date:string;time:string;kind:'更新'|'优化'|'公告'|'下线';title:string;body:string[];urgent?:true;feature?:unknown;
}
export interface ChangelogResponse {latestVersion:string;releases:ChangelogRelease[]}
