/** XML 1.0 character checks omitted by some permissive DOM parsers. */
function allowed(value:number):boolean {
  return value === 9 || value === 10 || value === 13 || value >= 0x20 && value <= 0xD7FF || value >= 0xE000 && value <= 0xFFFD || value >= 0x10000 && value <= 0x10FFFF;
}
export function validXmlCharacters(source:string):boolean {
  for (let index = 0;index < source.length;index++) {
    const value = source.codePointAt(index)!;
    if (!allowed(value)) return false;
    if (value > 0xFFFF) index++;
  }
  for (let index = 0;index < source.length;index++) {
    let terminator:string | undefined;
    let prefix = 0;
    if (source.startsWith('<!--',index)) {terminator = '-->';prefix = 4;}
    else if (source.startsWith('<![CDATA[',index)) {terminator = ']]>';prefix = 9;}
    else if (source.startsWith('<?',index)) {terminator = '?>';prefix = 2;}
    if (terminator) {
      const end = source.indexOf(terminator,index + prefix);
      if (end < 0) return true; // The structural parser rejects incomplete markup.
      index = end + terminator.length - 1;
    } else if (source.startsWith('&#',index)) {
      const hex = source[index + 2] === 'x';
      const start = index + (hex ? 3 : 2);
      let end = start;
      while (end < source.length && (hex ? /[0-9a-fA-F]/ : /[0-9]/).test(source[end]!)) end++;
      if (end === start || source[end] !== ';' || !allowed(Number.parseInt(source.slice(start,end),hex ? 16 : 10))) return false;
      index = end;
    }
  }
  return true;
}
