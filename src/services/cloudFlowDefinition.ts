import {createHash} from 'node:crypto';
type Row=Record<string,any>;
function object(v:unknown,allowed:string[],required:string[]):Row {if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))throw new Error('Invalid flow specification');return v as Row;}
function label(v:unknown):string {if(typeof v!=='string'||!v.trim()||v.length>120||/[\x00-\x1f]/.test(v))throw new Error('Invalid flow name');return v.trim();}
function stepName(v:unknown):string {if(typeof v!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v))throw new Error('Invalid action name');return v;}
function scalar(v:unknown):v is string|number|boolean {return ['string','number','boolean'].includes(typeof v)&&!(typeof v==='number'&&!Number.isFinite(v))&&!(typeof v==='string'&&(v.length>4000||v.startsWith('@')));}
function odataField(v:unknown):string {if(typeof v!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(v))throw new Error('Invalid Dataverse field name');return v;}
function odataLiteral(v:unknown):string {
 if(typeof v==='string'){if(v.length>1000||v.startsWith('@')||/[\x00-\x1f]/.test(v))throw new Error('Invalid Dataverse filter string');return `'${v.replace(/'/g,"''")}'`;}
 if(typeof v==='boolean')return v?'true':'false';
 if(typeof v==='number'&&Number.isFinite(v)&&!/[eE]/.test(String(v)))return String(v);
 throw new Error('Invalid Dataverse filter literal');
}
function listParameters(node:Row,parameters:Row):void {
 if(node.top!==undefined){if(!Number.isInteger(node.top)||node.top<1||node.top>5000)throw new Error('Invalid row limit');parameters['$top']=node.top;}
 if(node.select!==undefined){if(!Array.isArray(node.select)||!node.select.length||node.select.length>50)throw new Error('Select 1–50 Dataverse fields');const fields=node.select.map(odataField);if(new Set(fields.map(v=>v.toLowerCase())).size!==fields.length)throw new Error('Duplicate Dataverse select field');parameters['$select']=fields.join(',');}
 if(node.order_by!==undefined){if(!Array.isArray(node.order_by)||!node.order_by.length||node.order_by.length>5)throw new Error('Provide 1–5 Dataverse order fields');const fields=node.order_by.map(item=>{const order=object(item,['field','direction'],['field','direction']);const field=odataField(order.field);if(!['asc','desc'].includes(order.direction))throw new Error('Invalid Dataverse order direction');return `${field} ${order.direction}`;});if(new Set(fields.map(v=>v.split(' ')[0].toLowerCase())).size!==fields.length)throw new Error('Duplicate Dataverse order field');parameters['$orderby']=fields.join(',');}
 if(node.filter!==undefined){const filter=object(node.filter,['conditions'],['conditions']);if(!Array.isArray(filter.conditions)||!filter.conditions.length||filter.conditions.length>10)throw new Error('Provide 1–10 Dataverse filter conditions');const conditions=filter.conditions.map(item=>{const condition=object(item,['field','operator','value'],['field','operator','value']);const field=odataField(condition.field);if(!['eq','ne','gt','ge','lt','le'].includes(condition.operator))throw new Error('Invalid Dataverse filter operator');return `${field} ${condition.operator} ${odataLiteral(condition.value)}`;});parameters['$filter']=conditions.join(' and ');}
}
/** Produces a bounded cloud-flow definition without connections or network requests. */
export function prepareCloudFlow(raw:unknown,binding?:{logicalName:string;connectionName:string}) {
 const a=object(raw,['name','trigger','actions','dataverse_connection'],['name','trigger','actions']),name=label(a.name),trigger=object(a.trigger,['kind','frequency','interval','entity_name','message','scope','filtering_attributes'],['kind']);let nativeTrigger:Row;
 if(trigger.kind==='manual'){if(Object.keys(trigger).length!==1)throw new Error('Manual trigger has no recurrence parameters');nativeTrigger={type:'Request',kind:'Button',inputs:{schema:{type:'object',properties:{},required:[]}}};}
 else if(trigger.kind==='recurrence'){if(Object.keys(trigger).some(k=>!['kind','frequency','interval'].includes(k))||!['Minute','Hour','Day','Week','Month'].includes(trigger.frequency)||!Number.isInteger(trigger.interval)||trigger.interval<1||trigger.interval>500)throw new Error('Invalid recurrence');nativeTrigger={type:'Recurrence',recurrence:{frequency:trigger.frequency,interval:trigger.interval}};}
 else if(trigger.kind==='dataverse_event'){
  if(trigger.frequency!==undefined||trigger.interval!==undefined||typeof trigger.entity_name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(trigger.entity_name)||![1,2,3,4].includes(trigger.message)||![1,2,3,4].includes(trigger.scope))throw new Error('Invalid Dataverse event trigger');
  if(typeof a.dataverse_connection!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(a.dataverse_connection))throw new Error('A Dataverse connection reference is required');
  const parameters:Row={'subscriptionRequest/message':trigger.message,'subscriptionRequest/entityname':trigger.entity_name,'subscriptionRequest/scope':trigger.scope};
  if(trigger.filtering_attributes!==undefined){if(!Array.isArray(trigger.filtering_attributes)||!trigger.filtering_attributes.length||trigger.filtering_attributes.length>50||trigger.filtering_attributes.some((v:unknown)=>typeof v!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(v)))throw new Error('Invalid filtering attributes');parameters['subscriptionRequest/filteringattributes']=trigger.filtering_attributes.join(',');}
  nativeTrigger={type:'OpenApiConnectionWebhook',inputs:{host:{connectionName:'shared_commondataserviceforapps',operationId:'SubscribeWebhookTrigger',apiId:'/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'},parameters,authentication:"@parameters('$authentication')"}};
 }
 else throw new Error('Unsupported trigger');
 if(!Array.isArray(a.actions)||a.actions.length<1||a.actions.length>20)throw new Error('Provide 1–20 actions');
 const literal=(v:unknown)=>scalar(v)||Array.isArray(v)&&v.length<=100&&v.every(scalar);
 let needsDataverse=trigger.kind==='dataverse_event';
 const actions:Row=Object.create(null),seen=new Set<string>(),variables=new Map<string,{action:string,type:string,name:string}>();
 const claimed=new Set<string>();for(const rawAction of a.actions){const id=stepName(rawAction?.name).toLowerCase();if(claimed.has(id))throw new Error('Duplicate action');claimed.add(id);}
 const reserve=(id:string)=>{const key=id.toLowerCase();if(claimed.has(key))throw new Error('Generated branch action name conflicts');claimed.add(key);};
 for(const item of a.actions){
  const x=object(item,['name','kind','value','after','variable_name','items_from_action','loop_actions','condition_source','then_value','else_value','then_actions','else_actions','entity_set','record_id','record_id_from_trigger','record_id_from_output','fields','top','select','order_by','filter'],['name','kind']),id=stepName(x.name),after=x.after??[];
  if(!Array.isArray(after)||after.length>10||new Set(after).size!==after.length||after.some((v:unknown)=>typeof v!=='string'||!Object.hasOwn(actions,v)))throw new Error('Dependencies must refer to earlier actions');
  const allowedFields:Record<string,string[]>={compose:['name','kind','value','after'],initialize_variable:['name','kind','variable_name','value','after'],condition:['name','kind','variable_name','condition_source','value','then_value','else_value','then_actions','else_actions','after'],for_each:['name','kind','variable_name','items_from_action','loop_actions','after'],dataverse_list:['name','kind','entity_set','top','select','order_by','filter','after'],dataverse_get:['name','kind','entity_set','record_id','record_id_from_trigger','record_id_from_output','after'],dataverse_create:['name','kind','entity_set','fields','after'],dataverse_update:['name','kind','entity_set','record_id','record_id_from_trigger','record_id_from_output','fields','after']};
  if(!allowedFields[x.kind]||Object.keys(x).some(k=>!allowedFields[x.kind].includes(k)))throw new Error('Invalid action fields');
  const runAfter=Object.fromEntries(after.map((v:string)=>[v,['Succeeded']]));
  const dynamicValue=(value:unknown,localActions?:Row,loopName?:string)=>{
   if(scalar(value))return value;
   const ref=object(value,['source','name','action'],['source','name']);
   if(typeof ref.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(ref.name))throw new Error('Invalid dynamic value name');
   if(ref.source!=='action'&&ref.action!==undefined)throw new Error('Unexpected source action');
   if(ref.source==='action'){const action=stepName(ref.action),local=!!localActions&&Object.hasOwn(localActions,action),previous=local?localActions![action]:actions[action];if(!local&&!after.includes(action)||previous?.type!=='OpenApiConnection'||!['GetItem','CreateRecord','UpdateOnlyRecord'].includes(previous.inputs?.host?.operationId))throw new Error('A preceding Dataverse row action must be a direct dependency or an earlier action in this branch');return `@outputs('${action}')?['body/${ref.name}']`;}
   if(ref.source==='trigger'){if(trigger.kind!=='dataverse_event')throw new Error('Trigger field requires a Dataverse event');return `@triggerOutputs()?['body/${ref.name}']`;}
   if(ref.source==='item'){if(!loopName)throw new Error('Current item requires a loop action');return `@items('${loopName}')?['${ref.name}']`;}
   if(ref.source==='variable'){const v=variables.get(ref.name.toLowerCase());if(!v||v.name!==ref.name||!after.includes(v.action))throw new Error('Variable initializer must be a direct dependency');return `@variables('${ref.name}')`;}
   throw new Error('Unsupported dynamic value');
  };
  const buildDataverse=(node:Row,dependencies:Row,localActions?:Row,loopName?:string):Row=>{
   needsDataverse=true;
   if(typeof a.dataverse_connection!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(a.dataverse_connection))throw new Error('A Dataverse connection reference is required');
   if(typeof node.entity_set!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(node.entity_set))throw new Error('A valid entity set name is required');
   const parameters:Row={entityName:node.entity_set};
   if(node.kind==='dataverse_list')listParameters(node,parameters);
   if(['dataverse_create','dataverse_update'].includes(node.kind)){if(!node.fields||typeof node.fields!=='object'||Array.isArray(node.fields)||!Object.keys(node.fields).length||Object.keys(node.fields).length>30)throw new Error('Bounded fields are required');for(const [field,value] of Object.entries(node.fields)){if(!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(field))throw new Error('Invalid field name');parameters['item/'+field]=dynamicValue(value,localActions,loopName);}}
   if(['dataverse_get','dataverse_update'].includes(node.kind)){if([node.record_id,node.record_id_from_trigger,node.record_id_from_output,node.record_id_from_item].filter(v=>v!==undefined).length!==1)throw new Error('Provide exactly one record ID source');if(node.record_id!==undefined){if(typeof node.record_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.record_id))throw new Error('A record GUID is required');parameters.recordId=node.record_id;}else if(node.record_id_from_trigger!==undefined)parameters.recordId=dynamicValue({source:'trigger',name:node.record_id_from_trigger},localActions,loopName);else if(node.record_id_from_item!==undefined)parameters.recordId=dynamicValue({source:'item',name:node.record_id_from_item},localActions,loopName);else {const ref=object(node.record_id_from_output,['action','name'],['action','name']);parameters.recordId=dynamicValue({source:'action',action:ref.action,name:ref.name},localActions,loopName);}}
   const operationId=node.kind==='dataverse_list'?'ListRecords':node.kind==='dataverse_get'?'GetItem':node.kind==='dataverse_create'?'CreateRecord':'UpdateOnlyRecord';
   return {type:'OpenApiConnection',inputs:{host:{apiId:'/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',connectionName:'shared_commondataserviceforapps',operationId},parameters,authentication:"@parameters('$authentication')"},runAfter:dependencies};
  };
  if(x.kind==='compose'){if(!scalar(x.value))throw new Error('Only bounded literal Compose values are supported');actions[id]={type:'Compose',inputs:x.value,runAfter};}
  else if(['dataverse_list','dataverse_get','dataverse_create','dataverse_update'].includes(x.kind)){actions[id]=buildDataverse(x,runAfter);}
  else if(x.kind==='initialize_variable'){
   const variable=stepName(x.variable_name),key=variable.toLowerCase();if(variables.has(key)||!literal(x.value))throw new Error('Invalid or duplicate variable');
   const type=Array.isArray(x.value)?'Array':typeof x.value==='boolean'?'Boolean':typeof x.value==='string'?'String':Number.isInteger(x.value)?'Integer':'Float';variables.set(key,{action:id,type,name:variable});
   actions[id]={type:'InitializeVariable',inputs:{variables:[{name:variable,type,value:x.value}]},runAfter};
  }else if(x.kind==='condition'){
   if((x.variable_name===undefined)===(x.condition_source===undefined))throw new Error('Provide exactly one condition source');
   let left:unknown;if(x.variable_name!==undefined){const variable=stepName(x.variable_name),ref=variables.get(variable.toLowerCase());if(!ref||ref.name!==variable||ref.type==='Array'||!after.includes(ref.action))throw new Error('Scalar variable initializer must be a direct dependency');left=dynamicValue({source:'variable',name:variable});}else{const ref=object(x.condition_source,['source','name','action'],['source','name']);if(ref.source==='variable'&&typeof ref.name==='string'&&variables.get(ref.name.toLowerCase())?.type==='Array')throw new Error('Condition source must be scalar');left=dynamicValue(ref);}
   if(!scalar(x.value))throw new Error('Invalid condition value');
   const branch=(items:unknown,value:unknown,suffix:string):Row=>{
    if((items===undefined)===(value===undefined))throw new Error('Each branch requires actions or a literal value');
    if(items===undefined){if(!scalar(value))throw new Error('Invalid branch value');const name=id+'_'+suffix;reserve(name);return {[name]:{type:'Compose',inputs:value,runAfter:{}}};}
    if(!Array.isArray(items)||items.length<1||items.length>5)throw new Error('Each branch supports 1–5 actions');
    const out:Row=Object.create(null);let previous:string|undefined;
    for(const raw of items){const node=object(raw,['name','kind','value','entity_set','record_id','record_id_from_trigger','record_id_from_output','fields','top','select','order_by','filter'],['name','kind']);const child=stepName(node.name);reserve(child);if(!['compose','dataverse_list','dataverse_get','dataverse_create','dataverse_update'].includes(node.kind)||Object.keys(node).some(k=>!(allowedFields[node.kind]||[]).includes(k)))throw new Error('Unsupported branch action');const dependencies=previous?{[previous]:['Succeeded']}:{};if(node.kind==='compose'){if(!scalar(node.value))throw new Error('Invalid branch Compose value');out[child]={type:'Compose',inputs:node.value,runAfter:dependencies};}else out[child]=buildDataverse(node,dependencies,out);previous=child;}
    return out;
   };
   const yes=branch(x.then_actions,x.then_value,'True'),no=branch(x.else_actions,x.else_value,'False');
   actions[id]={type:'If',expression:{and:[{equals:[left,x.value]}]},actions:yes,else:{actions:no},runAfter};
  }else if(x.kind==='for_each'){
   if((x.variable_name===undefined)===(x.items_from_action===undefined))throw new Error('Provide exactly one loop source');let collection:string;
   if(x.variable_name!==undefined){const variable=stepName(x.variable_name),ref=variables.get(variable.toLowerCase());if(!ref||ref.name!==variable||ref.type!=='Array'||!after.includes(ref.action))throw new Error('Array variable initializer must be a direct dependency');collection=`@variables('${variable}')`;}
   else{const list=stepName(x.items_from_action),source=actions[list];if(!after.includes(list)||source?.type!=='OpenApiConnection'||source.inputs?.host?.operationId!=='ListRecords')throw new Error('A Dataverse list action must be a direct dependency');collection=`@body('${list}')?['value']`;}
   let children:Row;if(x.loop_actions===undefined){const nested=id+'_Item';reserve(nested);children={[nested]:{type:'Compose',inputs:'@item()',runAfter:{}}};}
   else{if(!Array.isArray(x.loop_actions)||x.loop_actions.length<1||x.loop_actions.length>5)throw new Error('Loop supports 1–5 actions');children=Object.create(null);let previous:string|undefined;for(const raw of x.loop_actions){const node=object(raw,['name','kind','value','entity_set','record_id','record_id_from_trigger','record_id_from_output','record_id_from_item','fields','top','select','order_by','filter'],['name','kind']),child=stepName(node.name);reserve(child);if(!['compose','dataverse_list','dataverse_get','dataverse_create','dataverse_update'].includes(node.kind)||Object.keys(node).some(k=>k!=='record_id_from_item'&&!(allowedFields[node.kind]||[]).includes(k))||node.record_id_from_item!==undefined&&!['dataverse_get','dataverse_update'].includes(node.kind))throw new Error('Unsupported loop action');const dependencies=previous?{[previous]:['Succeeded']}:{};if(node.kind==='compose'){if(!scalar(node.value))throw new Error('Invalid loop Compose value');children[child]={type:'Compose',inputs:node.value,runAfter:dependencies};}else children[child]=buildDataverse(node,dependencies,children,id);previous=child;}}
   actions[id]={type:'Foreach',foreach:collection,actions:children,operationOptions:'Sequential',runAfter};
  }else throw new Error('Unsupported action');
  seen.add(id.toLowerCase());
 }
 if(!needsDataverse && a.dataverse_connection!==undefined)throw new Error('Unused Dataverse connection reference');
 if(binding&&binding.logicalName!==a.dataverse_connection)throw new Error('Connection binding does not match the flow spec');
 const connectionReferences:Row=needsDataverse?{shared_commondataserviceforapps:{impersonation:{},runtimeSource:'embedded',connection:{connectionReferenceLogicalName:a.dataverse_connection,...(binding?{name:binding.connectionName}:{})},api:{name:'shared_commondataserviceforapps'}}}:{};
 const clientData={properties:{connectionReferences,definition:{$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'1.0.0.0',parameters:{$connections:{defaultValue:{},type:'Object'},$authentication:{defaultValue:{},type:'SecureObject'}},triggers:{trigger:nativeTrigger},actions}},schemaVersion:'1.0.0.0'};
 const json=JSON.stringify(clientData);return {name,definition:clientData,definitionHash:createHash('sha256').update(json).digest('hex'),trigger:trigger.kind,actionNames:Object.keys(actions),connectionsRequired:needsDataverse?[a.dataverse_connection]:[],bindingResolved:!needsDataverse||!!binding,platformValidation:'not_performed',created:false};
}
