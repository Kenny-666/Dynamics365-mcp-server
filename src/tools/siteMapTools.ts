const id = {type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'};
const dry = {type:'boolean',description:'Default true reads the latest saved and published definitions and previews publication without writing.'};
const hash = {type:'string',pattern:'^[a-f0-9]{64}$',description:'Current planHash from the publication preview, required for execution.'};
const scope = {type:'boolean',description:'Required true for execution: acknowledge native SiteMap publication scope, including other pending SiteMap changes on legacy servers, without an atomic lock.'};
export const siteMapTools = [{name:'publish_sitemap',
  description:'Publish previously saved SiteMap navigation XML separately from record editing. Default preview reads native RetrieveUnpublishedMultiple and the published record, returning a planHash. Execute with dry_run=false, expected_hash and allow_sitemap_scope_publish=true. Calls native PublishXml directly without CSDL, does not PATCH/save, verifies published XML after acceptance and preserves accepted/unknown evidence on failure. Legacy servers may ignore the ID and publish wider SiteMap scope. No PublishAllXml fallback; browser/app UI and app-module publication remain separate.',
  inputSchema:{type:'object',additionalProperties:false,required:['id'],properties:{id,dry_run:dry,expected_hash:hash,allow_sitemap_scope_publish:scope,
    dryRun:{...dry,'x-alias-for':'dry_run'},expectedHash:{...hash,'x-alias-for':'expected_hash'},allowSitemapScopePublish:{...scope,'x-alias-for':'allow_sitemap_scope_publish'}}},
  annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}}];
