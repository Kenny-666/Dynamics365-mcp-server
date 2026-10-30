import type { CrmRequestClient } from '../types/crmRequest.js';
import { bool,EvidenceReader,guid,identifier,input,integer,invalid,literal,malformed,pick,protect,query,rowGuid,text,type Row } from './readEvidence.js';

const catalogs:Row = {
  systemuser:{set:'systemusers',id:'systemuserid',name:'fullname',fields:['systemuserid','fullname','isdisabled','_businessunitid_value']},
  team:{set:'teams',id:'teamid',name:'name',fields:['teamid','name','teamtype','_businessunitid_value']},
  role:{set:'roles',id:'roleid',name:'name',fields:['roleid','name','_businessunitid_value','_parentrootroleid_value']},
};
const rightBits:Record<string,number> = {ReadAccess:1,WriteAccess:2,AppendAccess:4,AppendToAccess:16,CreateAccess:32,
  DeleteAccess:65536,ShareAccess:262144,AssignAccess:524288};
export class SecurityEvidenceService {
  constructor(private readonly client:CrmRequestClient) {}
  principals(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = input(raw,['principal_type','principal_id','name_keyword','business_unit_id','enabled','top','max_pages']);
    const kind = args.principal_type ?? 'systemuser';
    if (typeof kind !== 'string' || !Object.hasOwn(catalogs,kind)) invalid('principal_type must be systemuser, team or role.');
    const catalog = catalogs[kind],conditions:string[] = [];
    if (args.principal_id !== undefined) conditions.push(catalog.id + ' eq ' + guid(args.principal_id,'principal_id'));
    if (args.name_keyword !== undefined) conditions.push('contains(' + catalog.name + ',' + literal(text(args.name_keyword,'name_keyword')) + ')');
    if (args.business_unit_id !== undefined) conditions.push('_businessunitid_value eq ' + guid(args.business_unit_id,'business_unit_id'));
    if (args.enabled !== undefined) {
      if (kind !== 'systemuser') invalid('enabled applies only to systemuser queries.');
      conditions.push('isdisabled eq ' + (bool(args.enabled,'enabled') ? 'false' : 'true'));
    }
    const top = integer(args.top,'top',50,1,100),pages = integer(args.max_pages,'max_pages',5,1,20);
    const reader = new EvidenceReader(this.client,signal);
    const params:Record<string,string> = {'$select':catalog.fields.join(','),'$orderby':catalog.name + ' asc,' + catalog.id + ' asc','$top':String(top)};
    if (conditions.length) params.$filter = conditions.join(' and ');
    const page = await reader.list('/' + catalog.set + '?' + query(params),top,pages);
    return {success:true,principalType:kind,...this.catalogPage(page,catalog),
      note:'Visible catalog rows are not effective record permissions. No implicit active-user filter is added.'};
  }); }

  context(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = input(raw,['principal_type','principal_id','include_team_roles','team_limit','role_limit']);
    const kind = args.principal_type ?? 'systemuser';
    if (!['systemuser','team'].includes(kind)) invalid('principal_type must be systemuser or team.');
    if (kind === 'team' && args.principal_id === undefined) invalid('A team principal_id is required.');
    let id = args.principal_id === undefined ? undefined : guid(args.principal_id,'principal_id');
    const includeTeamRoles = bool(args.include_team_roles,'include_team_roles',true);
    const teamLimit = integer(args.team_limit,'team_limit',10,1,25),roleLimit = integer(args.role_limit,'role_limit',50,1,100);
    const reader = new EvidenceReader(this.client,signal),catalog = catalogs[kind];
    if (!id) id = rowGuid((await reader.get('/WhoAmI')).UserId);
    const root = '/' + catalog.set + '(' + id + ')';
    const principal = await reader.component('principal',async () => {
      const row = await reader.get(root + '?$select=' + catalog.fields.join(','));
      if (rowGuid(row[catalog.id]) !== id) malformed();
      return pick(row,catalog.fields);
    });
    const roles = await reader.component('direct_roles',() => this.rolePage(reader,root + '/' + (kind === 'systemuser' ? 'systemuserroles_association' : 'teamroles_association'),roleLimit));
    let teams:Row | null = null;
    const teamRoles:Row[] = [];
    if (kind === 'systemuser') {
      teams = await reader.component('visible_team_memberships',async () => {
        const page = await reader.list(root + '/teammembership_association?' + query({'$select':catalogs.team.fields.join(','),
          '$orderby':'teamid asc','$top':String(teamLimit)}),teamLimit,5);
        return this.catalogPage(page,catalogs.team);
      });
      if (includeTeamRoles && teams.status === 'ok') for (const team of teams.data.items) {
        const teamId = rowGuid(team.teamid);
        teamRoles.push({teamId,...await reader.component('team_roles',() => this.rolePage(reader,'/teams(' + teamId + ')/teamroles_association',roleLimit))});
      }
    }
    const all = [principal,roles,...(teams ? [teams] : []),...teamRoles];
    return {success:true,principalType:kind,principalId:id,principal,directRoles:roles,teams,teamRoles,
      coverage:all.some(source => source.status !== 'ok' || source.data?.paging?.limited) || (kind === 'systemuser' && !includeTeamRoles) ? 'partial' : 'bounded_visible_catalog',
      effectiveAccess:'not_calculated',
      note:'Direct roles and visible team memberships are evidence only. Group membership, sharing, hierarchy, role inheritance and field security are not reconstructed. Use get_record_access for native effective record rights.'};
  }); }

  access(raw:unknown,signal?:AbortSignal) { return protect(async () => {
    const args = input(raw,['principal_type','principal_id','collection_name','record_id']);
    const kind = args.principal_type ?? 'systemuser';
    if (!['systemuser','team','organization'].includes(kind)) invalid('principal_type must be systemuser, team or organization.');
    if (kind !== 'systemuser' && args.principal_id === undefined) invalid('principal_id is required for team/organization access checks.');
    const collection = identifier(args.collection_name,'collection_name'),targetId = guid(args.record_id,'record_id');
    let id = args.principal_id === undefined ? undefined : guid(args.principal_id,'principal_id');
    const reader = new EvidenceReader(this.client,signal);
    if (!id) id = rowGuid((await reader.get('/WhoAmI')).UserId);
    const set = kind === 'systemuser' ? 'systemusers' : kind === 'team' ? 'teams' : 'organizations';
    const result = await reader.get('/' + set + '(' + id + ')/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@target)?' +
      query({'@target':JSON.stringify({'@odata.id':collection + '(' + targetId + ')'})}));
    const rawRights = result.AccessRights;
    let rights:string[],unknownBits = 0;
    if (typeof rawRights === 'number' && Number.isInteger(rawRights) && rawRights >= 0 && rawRights <= 2147483647) {
      rights = Object.entries(rightBits).filter(([_name,bit]) => (rawRights & bit) !== 0).map(([name]) => name);
      unknownBits = rawRights & ~Object.values(rightBits).reduce((mask,bit) => mask | bit,0);
    } else if (typeof rawRights === 'string') {
      rights = rawRights === 'None' ? [] : [...new Set(rawRights.split(',').map(name => name.trim()))];
      if (rights.some(name => !Object.hasOwn(rightBits,name))) malformed();
    } else malformed();
    return {success:true,source:'RetrievePrincipalAccess',principal:{type:kind,id},target:{collectionName:collection,id:targetId},
      rights,unknownBits,fieldSecurity:'not_evaluated',reasonForRights:'not_explained',
      note:'Native record rights are evidence at read time. They do not explain every role/share source or guarantee field access and business-rule success.'};
  }); }

  private async rolePage(reader:EvidenceReader,endpoint:string,top:number) {
    const page = await reader.list(endpoint + '?' + query({'$select':catalogs.role.fields.join(','),'$orderby':'roleid asc','$top':String(top)}),top,5);
    return this.catalogPage(page,catalogs.role);
  }
  private catalogPage(page:Row,catalog:Row):Row {
    const items = page.rows.map((row:Row) => { rowGuid(row[catalog.id]); return pick(row,catalog.fields); });
    return {items,count:items.length,paging:page.paging};
  }
}
