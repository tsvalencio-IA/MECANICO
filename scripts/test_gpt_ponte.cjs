const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../gpt-ponte.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const core=scripts.find(x=>x.includes('THIA_GPT_BRIDGE=api'));
assert.ok(core,'Ponte deve conter o construtor de ficha');
const sandbox={window:{},module:{exports:{}},URL};
vm.runInNewContext(core,sandbox,{timeout:1000});
const {build,safeCaseId,validChatUrl,PLUGIN_URL}=sandbox.module.exports;
test('preserva registros repetidos de scanner e informa incerteza',()=>{
 const text=build({mediaAnalysis:[{kind:'scanner',scannerRows:[{id:'99',description:'cânister controle aberto'},{id:'99',description:'cânister'}]}]});
 assert.equal((text.match(/OCR\/extração NÃO VERIFICADA/g)||[]).length,2);
});
test('não promove texto da IA a relato verificado',()=>{
 const text=build({messages:[{role:'bot',text:'chicote reparado'},{role:'user',text:'chicote estava quebrado'}]});
 assert.match(text,/chicote estava quebrado/);assert.doesNotMatch(text,/chicote reparado/);
});
test('não alega envio automático de fotografias originais',()=>assert.match(build({}),/Imagens originais NÃO foram transferidas/));
test('valida links para chatgpt.com e rejeita host externo',()=>{
 assert.equal(validChatUrl('https://evil.test/c/abc'),'');
 assert.equal(validChatUrl('https://chatgpt.com.evil.test/c/abc'),'');
 assert.equal(validChatUrl('javascript:alert(1)'),'');
 assert.ok(validChatUrl('https://chatgpt.com/c/test123'));
 assert.match(PLUGIN_URL,/^https:\/\/chatgpt.com\/plugins\//);
});
test('ID de caso não aceita separador de caminho',()=>{
 assert.equal(safeCaseId('../usuario'),'');
 assert.ok(safeCaseId('CASE-1710000000-abcde'));
});
test('limita comprimento dos relatos sem omitir classificação de testes',()=>{
 const text=build({messages:[{role:'user',text:'X'.repeat(5000)}],tests:[{title:'T01',outcome:'good'}]});
 assert.ok(text.length<=35000);
 assert.equal((text.match(/X/g)||[]).length,1700);
 assert.match(text,/resultado registrado: good/);
});
