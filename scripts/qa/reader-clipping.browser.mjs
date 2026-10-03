/** Synthetic real-epubjs regression: reader/sidebar widths change without window.resize. */
export async function runReaderClippingQA(page,outputDir){
 const base='http://127.0.0.1:3018',results=[];
 const ready=()=>page.waitForFunction(()=>document.querySelector('[data-reading-phase]')?.dataset.readingPhase==='ready',{},{timeout:10000});
 const tools=async()=>{const width=page.viewportSize().width;await page.mouse.move(width/2,300);await page.mouse.move(width/2,2);await page.waitForTimeout(80);if(await page.getByLabel('阅读方式').isHidden())await page.getByRole('button',{name:'展开阅读工具栏',exact:true}).press('Enter');};
 const measure=()=>page.evaluate(()=>({phase:document.querySelector('[data-reading-phase]').dataset.readingPhase,anchor:qa.savedProgress().location,frames:[...document.querySelectorAll('iframe')].filter(f=>f.contentDocument?.querySelector('#p0')).map(f=>{const d=f.contentDocument,r=d.createRange();r.selectNodeContents(d.querySelector('#p0'));return {frame:f.getBoundingClientRect().width,body:d.body.getBoundingClientRect().width,maxRight:Math.max(...[...r.getClientRects()].map(r=>r.right))};})}));
 const assertWidth=async(label)=>{await ready();const actual=await measure();if(!actual.frames.length||actual.frames.some(f=>Math.abs(f.frame-f.body)>1||f.maxRight>f.frame+1))throw new Error(label+' clipped: '+JSON.stringify(actual));return actual;};
 // Reflow and fixed-layout books, with continuous/paginated behavior left native.
 for(const scenario of [{kind:'vertical',width:2048,height:1060,parent:1400},{kind:'paginated',width:1400,height:900,parent:1024},{kind:'vertical',width:390,height:844,parent:300},{kind:'fixed',width:1400,height:900,parent:1024}]){
  await page.setViewportSize({width:scenario.width,height:scenario.height});await page.request.post(base+'/__qa_reset');await page.goto(base+(scenario.kind==='fixed'?'/?fixed=1':'/'));await page.evaluate(()=>localStorage.clear());await page.reload();await ready();await tools();
  if(scenario.kind==='vertical'){await page.getByLabel('阅读方式').selectOption('vertical');await ready();await tools();}
  if(scenario.kind!=='fixed'){await page.getByRole('checkbox',{name:'语义翻牌',exact:true}).check();await ready();const cfi=await page.evaluate(()=>qa.canonicalWordCFI('CAT',0));await page.evaluate(cfi=>qa.flipWord(cfi),cfi);await ready();}
  const source=await page.evaluate(()=>qa.canonicalWordCFI('CAT',1));
  await page.evaluate(width=>{document.querySelector('#root').style.width=width+'px';window.dispatchEvent(new Event('resize'));},scenario.parent);await page.waitForTimeout(650);await ready();
  const narrow=await measure();await page.evaluate(()=>{document.querySelector('#root').style.width='';});await page.waitForTimeout(650);await ready();
  const wide=scenario.kind==='vertical'?await assertWidth(scenario.kind+' widen'):await measure();
  // A second in-place narrowing catches stale locked widths in the opposite direction.
  await page.evaluate(width=>{document.querySelector('#root').style.width=width+'px';},scenario.parent);await page.waitForTimeout(650);await ready();
  const again=scenario.kind==='vertical'?await assertWidth(scenario.kind+' narrow'):await measure();
  await page.evaluate(()=>{document.querySelector('#root').style.width='';});await page.waitForTimeout(650);await ready();
  if(await page.evaluate(()=>qa.canonicalWordCFI('CAT',1))!==source)throw new Error('Original word CFI changed during parent resize');
  if(scenario.kind!=='fixed'&&await page.evaluate(()=>qa.completed().length)!==1)throw new Error('Flip lost during parent resize');
  if(scenario.kind==='vertical'){
   await tools();await page.getByRole('checkbox',{name:'意群阅读',exact:true}).check();await page.waitForTimeout(500);
   await page.setViewportSize({width:scenario.width===390?844:1024,height:scenario.width===390?390:768});await page.waitForTimeout(650);await assertWidth('window/orientation resize');
   await page.setViewportSize({width:scenario.width,height:scenario.height});await page.waitForTimeout(650);await assertWidth('return orientation');
  }
  if(await page.locator('[role=alert]').count())throw new Error('Reader raised a restoration error');
  results.push({scenario,initialFrame:narrow.frames[0].frame,widenedFrame:wide.frames[0].frame,narrowedAgain:again.frames[0].frame,canonicalSourcePreserved:true,flipPreserved:scenario.kind!=='fixed'});
  if(outputDir)await page.screenshot({path:outputDir+'/clipping-'+scenario.kind+'-'+scenario.width+'.png'});
 }
 await page.setViewportSize({width:1400,height:900});return results;
}
