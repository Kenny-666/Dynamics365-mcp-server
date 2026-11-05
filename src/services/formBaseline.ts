import {xmlHash} from './modelUiXml.js';
import {hash} from './modelMetadata.js';

type Row=Record<string,any>;

/** Portable evidence for later review, not an attestation of publication or provenance. */
export function captureFormBaseline(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Baseline input must be an object.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['form','label'].includes(k))||!input.form||typeof input.form!=='object'||Array.isArray(input.form)||typeof input.label!=='string'||!input.label.trim()||input.label.length>200||/[\x00-\x1f]/.test(input.label))throw new Error('Form and baseline label are required.');
 const form=input.form;
 if(form.kind!=='form'||form.type!==2||typeof form.logicalName!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(form.logicalName)||typeof form.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.id)||typeof form.xml?.formxml!=='string')throw new Error('A saved main-form definition with a valid identity and XML is required.');
 if(Buffer.byteLength(form.xml.formxml,'utf8')>4*1024*1024)throw new Error('Form definition exceeds baseline limit.');
 const snapshot={version:1,label:input.label.trim(),form:{kind:'form',type:2,id:form.id.toLowerCase(),logicalName:form.logicalName,name:typeof form.name==='string'?form.name:null,xml:{formxml:form.xml.formxml}},xmlHash:xmlHash(form.xml.formxml,'form')};
 return {snapshot,snapshotHash:hash(snapshot),provenance:'caller_supplied',publication:'not_verified',guidance:'Store the snapshot and hash in a controlled versioned location. The hash detects changes but does not authenticate who created it or prove it was deployed.'};
}

export function verifyFormBaseline(raw:unknown) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Baseline verification input must be an object.');
 const input=raw as Row;
 if(Object.keys(input).some(k=>!['snapshot','expected_hash'].includes(k))||typeof input.expected_hash!=='string'||!/^[a-f0-9]{64}$/.test(input.expected_hash)||!input.snapshot||typeof input.snapshot!=='object'||Array.isArray(input.snapshot))throw new Error('A snapshot and expected SHA-256 are required.');
 const s=input.snapshot;if(s.version!==1||Object.keys(s).some(k=>!['version','label','form','xmlHash'].includes(k)))throw new Error('Unsupported baseline snapshot.');
 const recreated=captureFormBaseline({form:s.form,label:s.label});
 const actualHash=hash(s),contentMatches=s.xmlHash===recreated.snapshot.xmlHash;
 return {valid:actualHash===input.expected_hash&&contentMatches,actualHash,contentMatches,form:recreated.snapshot.form,provenance:'not_authenticated',publication:'not_verified',executionAllowed:false};
}
