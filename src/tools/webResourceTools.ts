const text = {type:'string', minLength:1};
const id = {...text, pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};

function pair(snake: string, camel: string, schema: Record<string, unknown>) {
  const canonical = {...schema};
  // Defaults belong to service normalization: schema default injection must not conflict with a supplied alias.
  delete canonical.default;
  return {[snake]:canonical, [camel]:{...canonical, 'x-alias-for':snake,
    description:'Compatibility alias for ' + snake + '; conflicting aliases are rejected.'}};
}

const source = {
  ...pair('file_path', 'filePath', {...text, description:'Absolute source-file path on the MCP server machine; read as bytes and Base64 encoded. Supply exactly one of file_path or content. Maximum 10 MiB.'}),
  content:{type:'string', description:'Inline content, UTF-8 by default. Supply exactly one of content or file_path; empty content is allowed.'},
  ...pair('content_encoding', 'contentEncoding', {type:'string', enum:['utf8','base64'], description:'Inline content encoding, default utf8. Base64 must be canonical. Not used with file_path.'}),
};
const write = {
  ...source,
  ...pair('display_name', 'displayName', text),
  description:{type:'string', description:'Optional description; an empty string clears it.'},
  publish:{type:'boolean', default:true, description:'Default true preserves the old save-and-publish behavior. Set false to save without publishing.'},
  ...pair('dry_run', 'dryRun', {type:'boolean', default:false, description:'Read-only preview showing the environment, target, metadata changes and content hashes. Does not save or publish.'}),
};
const sourceRequired = {anyOf:[{required:['file_path']}, {required:['filePath']}, {required:['content']}]};

export const webResourceTools = [
  {
    name:'search_web_resources_by_name',
    description:'Find Web Resources by a substring of name, with bounded OData results. Defaults to published definitions; include_unpublished=true reads the latest saved definitions. Content is excluded by default. Supports the legacy camelCase parameters.',
    inputSchema:{type:'object', additionalProperties:false, properties:{
      ...pair('name_keyword', 'nameKeyword', text),
      top:{type:'integer', minimum:1, maximum:100, default:50},
      ...pair('include_content', 'includeContent', {type:'boolean', default:false, description:'Return Base64 source content only when explicitly requested.'}),
      ...pair('include_unpublished', 'includeUnpublished', {type:'boolean', default:false, description:'Read latest saved definitions, including unpublished resources, using RetrieveUnpublishedMultiple.'}),
    }, anyOf:[{required:['name_keyword']}, {required:['nameKeyword']}]},
    annotations:{readOnlyHint:true},
  },
  {
    name:'create_web_resource_and_publish',
    description:'Create a Web Resource without overwriting an existing saved name. Defaults to scoped PublishXml after saving. publish=false saves only; dry_run=true previews without writing. A publication error preserves saved=true and the created ID; recover with publish_web_resource.',
    inputSchema:{type:'object', additionalProperties:false, properties:{
      ...write, name:text,
      ...pair('web_resource_type', 'webResourceType', {type:'integer', minimum:1, maximum:12, description:'1 HTML, 2 CSS, 3 JS, 4 XML, 5 PNG, 6 JPG, 7 GIF, 8 XAP, 9 XSL, 10 ICO, 11 SVG, 12 RESX; platform/version support is validated on save.'}),
      ...pair('solution_unique_name', 'solutionUniqueName', {...text, pattern:'^[a-zA-Z_][a-zA-Z0-9_]*$', description:'Optional unmanaged solution unique name, sent in MSCRM.SolutionUniqueName when creating.'}),
    }, required:['name'], allOf:[sourceRequired,
      {anyOf:[{required:['display_name']}, {required:['displayName']}]},
      {anyOf:[{required:['web_resource_type']}, {required:['webResourceType']}]}]},
    annotations:{readOnlyHint:false, destructiveHint:true, idempotentHint:false},
  },
  {
    name:'update_web_resource_and_publish',
    description:'Update an existing Web Resource by GUID and optionally publish it. Uses If-Match:* to prevent accidental upsert; pass if_match for optimistic concurrency. dry_run reads the latest saved/unpublished definition and returns hashes and ETag. Does not rename or change the resource type.',
    inputSchema:{type:'object', additionalProperties:false, properties:{
      ...write, id,
      ...pair('if_match', 'ifMatch', {...text, description:'A specific ETag from a previous read/preview, such as W/"123". HTTP 412 is a conflict and is never retried.'}),
    }, required:['id'], allOf:[sourceRequired]},
    annotations:{readOnlyHint:false, destructiveHint:true, idempotentHint:false},
  },
  {
    name:'publish_web_resource',
    description:'Publish a single saved Web Resource with native PublishXml, without saving/re-uploading content. Use for save-only workflows or recovery after a publish failure. Publishes the latest saved version at execution time.',
    inputSchema:{type:'object', additionalProperties:false, properties:{id,
      ...pair('dry_run', 'dryRun', {type:'boolean', default:false, description:'Preview environment and the single-resource publication scope without executing PublishXml.'}),
    }, required:['id']},
    annotations:{readOnlyHint:false, destructiveHint:true, idempotentHint:false},
  },
];
