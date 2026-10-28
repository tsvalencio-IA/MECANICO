import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadKnowledge,findEvidence,replyText,buildInstruction} from '../integracao-openai/core.mjs';

test('sem biblioteca o serviço não fabrica referências',()=>{
 const k=loadKnowledge('/nonexistent/path');assert.equal(k.available,false);assert.deepEqual(findEvidence(k,'Hilux 2018'),[]);
});
test('recupera apenas registros efetivos e nunca confirma aplicação automaticamente',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mecanico-'));
 const files=Array.from({length:13},(_,i)=>`FONTES_EXTRAIDAS_${String(i+1).padStart(2,'0')}.md`).concat(Array.from({length:5},(_,i)=>`OCR_NAO_VERIFICADO_${String(i+1).padStart(2,'0')}.md`));
 for (const f of files)fs.writeFileSync(path.join(tmp,f),'# vazio\n');
 fs.appendFileSync(path.join(tmp,files[0]),'\n## Fonte R007513 — Treinamento/Cambios/01M.pdf\nMETADADOS_DA_FONTE = {"id":"R007513","caminho":"Treinamento/Cambios/01M.pdf","pagina":5,"status":"source_extracted"}\nINÍCIO_DO_TEXTO_EXTRAÍDO\nDiagnóstico de Falhas 36 Corpo de Válvulas 84\nFIM_DO_TEXTO_EXTRAÍDO\n');
 fs.writeFileSync(path.join(tmp,'SKILL.md'),'# Teste\n');
 const k=loadKnowledge(tmp);assert.equal(k.available,true);assert.equal(k.count,1);
 const found=findEvidence(k,'Transmissão 01M diagnóstico corpo válvulas',3);assert.equal(found[0].id,'R007513');assert.match(found[0].aplicacao,/NÃO CONFIRMADA/);
 fs.rmSync(tmp,{recursive:true,force:true});
});
test('não considera mensagens de ferramenta como resposta da IA',()=>{
 assert.equal(replyText({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Teste aprovado'}]}]}),'Teste aprovado');
 assert.equal(replyText({output:[{type:'function_call',content:[]}]}),'');
});
test('instruções deixam explícito limite documental',()=>{
 assert.match(buildInstruction('',[],false),/NÃO CARREGADA/);
});
