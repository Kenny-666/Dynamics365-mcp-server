import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(fs.readFileSync(path.join(project,'package-lock.json'),'utf8'));
const sections=['THIRD-PARTY DEPENDENCY NOTICES',
  'Production dependency declarations and upstream notice files from the installed lockfile tree.',
  'The bundled server may use only a subset of these packages. Runtime redistributions carry their own licenses.'];
let count=0;
for(const [relative,entry] of Object.entries(lock.packages).filter(([key,value])=>key.startsWith('node_modules/')&&!value.dev)){
  const folder=path.join(project,relative),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));
  sections.push('\n'+'='.repeat(72),pkg.name+'@'+pkg.version,
    'Declared license: '+JSON.stringify(pkg.license??entry.license??null),
    'Author: '+JSON.stringify(pkg.author??null),'Repository: '+JSON.stringify(pkg.repository??null));
  for(const file of fs.readdirSync(folder,{withFileTypes:true}).filter(e=>e.isFile()&&/^(LICENSE|LICENCE|NOTICE|COPYING|AUTHORS)(\.|$)/i.test(e.name))){
    sections.push('\n--- '+file.name+' ---\n',fs.readFileSync(path.join(folder,file.name),'utf8'));
  }
  count++;
}
fs.writeFileSync(path.join(project,'THIRD_PARTY_NOTICES.txt'),sections.join('\n')+'\n');
console.log('Collected upstream notices for '+count+' production dependency entries.');
