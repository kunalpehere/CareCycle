import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const axeSource = await readFile(path.resolve('node_modules/axe-core/axe.min.js'),'utf8');
let loginAttempt = 0;
const login = async (page,kind,project) => {
    await page.context().setExtraHTTPHeaders({'X-Forwarded-For':`192.0.2.${100 + ++loginAttempt}`});
    if((await page.context().cookies()).some(cookie=>cookie.name==='token')) {
        await page.goto('/home'); await page.getByRole('button',{name:'Sign out',exact:true}).click();
    }
    await page.goto(kind==='admin'?'/admin/login':'/login');
    await page.getByLabel(kind==='admin'?'Administration email':'Email address',{exact:true}).fill(`${kind}-day18-${project}@example.invalid`);
    await page.getByLabel('Password',{exact:true}).fill('Accessibility-fixture-42!');
    await page.getByRole('button',{name:kind==='admin'?'Enter CareCycle Administration':'Sign in as participant',exact:true}).click();
};
const blockExternal = page => page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4183'?route.continue():route.abort());

test('all rendered page families pass accessibility and responsive content audits', async ({ browser },testInfo) => {
    test.setTimeout(300000);
    const project=testInfo.project.name, fixture=JSON.parse(await readFile('artifacts/day-18-fixtures.json','utf8'))[project];
    const context=await browser.newContext({baseURL:'http://127.0.0.1:4183',bypassCSP:true,extraHTTPHeaders:{'X-Forwarded-For':project==='desktop'?'192.0.2.181':'192.0.2.182'}});
    const page=await context.newPage(); await blockExternal(page);
    const reports=[];
    const audit=async (name,url) => {
        if(url) await page.goto(url);
        if(name==='donor-dashboard') await page.locator('details').evaluateAll(items=>items.forEach(item=>item.open=true));
        await page.addScriptTag({content:axeSource});
        const result=await page.evaluate(async()=>{
            const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}});
            const effects=[...document.querySelectorAll('body *')].filter(element=>{const style=getComputedStyle(element);return style.backgroundImage.includes('gradient')||style.animationName!=='none';}).map(element=>element.tagName+'.'+element.className);
            const luminance=color=>{const rgb=color.match(/[\d.]+/g)?.slice(0,3).map(Number);if(!rgb||rgb.length!==3)return null;return rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);};
            const borders=[];
            for(const input of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')) {
                if(input.disabled||!input.getClientRects().length)continue;const style=getComputedStyle(input);
                if(parseFloat(style.borderTopWidth)===0||style.backgroundColor==='rgba(0, 0, 0, 0)')continue;
                const front=luminance(style.borderTopColor),back=luminance(style.backgroundColor);if(front===null||back===null)continue;
                const ratio=(Math.max(front,back)+.05)/(Math.min(front,back)+.05);if(ratio<3)borders.push({field:input.name||input.id,ratio});
            }
            return {violations:result.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),incomplete:result.incomplete.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)})),overflow:document.documentElement.scrollWidth>innerWidth,effects,borders};
        });
        reports.push({name,width:page.viewportSize().width,...result});
        await mkdir('artifacts/day-18',{recursive:true});
        await writeFile(`artifacts/day-18/audit-${project}.json`,JSON.stringify(reports,null,2));
        if(['home','donor-dashboard','ngo-dashboard','admin-dashboard','listing-errors','receipt-document'].includes(name)) { await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:`artifacts/day-18/${name}-${project}-${page.viewportSize().width}.png`,fullPage:true}); }
    };
    try {
        for(const viewport of project==='desktop'?[{width:1366,height:900},{width:768,height:1024}]:[{width:320,height:740}]) {
            await page.setViewportSize(viewport); await context.clearCookies();
            for(const [name,url] of [['home','/home'],['about','/about'],['contact','/contact'],['login','/login'],['register','/register'],['admin-login','/admin/login'],['admin-access','/admin/access-request'],['not-found','/synthetic-missing-page']]) await audit(name,url);
            await login(page,'empty',project); await audit('empty-donor','/donor/dashboard'); await audit('empty-notifications','/notifications');
            await login(page,'donor',project);
            for(const [name,url] of [['donor-dashboard','/donor/dashboard'],['listing-form','/donate'],['listing-edit',`/donations/${fixture.listing}/edit`],['listing-quantity',`/donations/${fixture.listing}/quantity`],['donor-requests','/donor/requests'],['pickup',`/donor/requests/${fixture.requests.accepted}/pickup`],['discrepancy',`/donor/requests/${fixture.requests.disputed}/pickup`],['completed-pickup',`/donor/requests/${fixture.requests.completed}/pickup`],['receipt',`/donor/requests/${fixture.requests.completed}/receipt`],['receipt-document',`/donor/requests/${fixture.requests.completed}/receipt/document`]]) await audit(name,url);
            await page.goto('/donate'); await page.locator('form.listing-form').evaluate(form=>form.noValidate=true); await page.getByRole('button',{name:'Create listing',exact:true}).click();await audit('listing-errors');
            await page.goto(`/donations/${fixture.listing}/quantity`);await page.locator('input[name="_version"]').evaluate(input=>input.value='999');await page.getByRole('button',{name:'Save total quantity',exact:true}).click();await audit('workflow-conflict');
            for(const kind of ['new','pending','rejected']) {await login(page,kind,project);await audit(`${kind}-ngo`,'/ngo/dashboard');await audit(`${kind}-organization`,kind==='new'?'/ngo/organization':`/ngo/organizations/${fixture.organizations[kind]}/edit`);}
            await login(page,'ngo',project);
            for(const [name,url] of [['ngo-dashboard','/ngo/dashboard'],['organization-profile',`/ngo/organizations/${fixture.organizations.ngo}/edit`],['discovery',`/ngo/equipment?location=${encodeURIComponent(`Day18 ${project}`)}`],['no-results','/ngo/equipment?location=SYNTHETIC_NO_RESULTS'],['equipment-detail',`/ngo/equipment/${fixture.listing}`],['ngo-requests','/ngo/requests'],['ngo-pickup',`/ngo/requests/${fixture.requests.accepted}/pickup`],['ngo-discrepancy',`/ngo/requests/${fixture.requests.disputed}/pickup`],['ngo-receipt',`/ngo/requests/${fixture.requests.completed}/receipt`],['access-denied','/donor/dashboard']])await audit(name,url);
            await login(page,'admin',project);
            for(const [name,url] of [['admin-dashboard','/admin/dashboard'],['admin-users','/admin/users'],['admin-review',`/admin/organizations/${fixture.organizations.pending}/review`],['admin-receipts','/admin/receipts'],['admin-receipt',`/admin/requests/${fixture.requests.completed}/receipt`],['admin-notifications','/notifications']])await audit(name,url);
        }
    } finally { await mkdir('artifacts/day-18',{recursive:true});await writeFile(`artifacts/day-18/audit-${project}.json`,JSON.stringify(reports,null,2));await context.close(); }
    const failures=reports.filter(report=>report.violations.length||report.overflow||report.effects.length||report.borders.length);
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});

test('keyboard menus, validation recovery, confirmation focus and reduced motion remain usable',async({page,browser},testInfo)=>{
    const project=testInfo.project.name;await blockExternal(page);await login(page,'donor',project);
    await page.setViewportSize(project==='desktop'?{width:768,height:1024}:{width:320,height:740});
    await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
    const menu=page.getByRole('button',{name:'Menu',exact:true});await menu.focus();await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('.mobile-create')).toBeVisible();
    await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(menu).toHaveAttribute('aria-expanded','false');
    await page.keyboard.press('Enter');await page.locator('.mobile-create').click();await expect(page).toHaveURL(/\/donate$/);
    await page.getByRole('button',{name:'Create listing',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.locator('.client-errors')).toBeFocused();
    const errorLink=page.locator('.client-errors a').filter({hasText:'Description'});await errorLink.focus();await page.keyboard.press('Enter');
    await expect(page.getByLabel('Description',{exact:true})).toBeFocused();
    const position=await page.getByLabel('Description',{exact:true}).boundingBox();expect(position.y).toBeGreaterThan(90);
    await page.goto('/donor/dashboard');const card=page.locator('.donation-card').filter({hasText:'Synthetic available accessibility listing'});
    const withdraw=card.getByRole('button',{name:'Withdraw',exact:true});await withdraw.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog',{name:'Confirm action'})).toBeVisible();await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');await expect(withdraw).toBeFocused();
    await page.keyboard.press('Enter');await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(withdraw).toBeFocused();
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.donation-card').first().hover();
    expect(await page.evaluate(()=>[...document.querySelectorAll('body *')].some(el=>{const css=getComputedStyle(el);return css.animationName!=='none'||css.transitionDuration.split(',').some(value=>parseFloat(value)>0);}))).toBe(false);
    await page.emulateMedia({forcedColors:'active'});await withdraw.focus();expect(await withdraw.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.emulateMedia({forcedColors:'none'});
    await withdraw.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
    await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeFocused();await page.keyboard.press('Enter');
    await expect(page.locator('.form-message')).toContainText('Listing withdrawn');
    await page.setViewportSize({width:1366,height:900});
    const fixture=JSON.parse(await readFile('artifacts/day-18-fixtures.json','utf8'))[project];await page.goto(`/donor/requests/${fixture.requests.completed}/receipt/document`);
    await page.emulateMedia({media:'print'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.pdf({path:`artifacts/day-18/receipt-${project}.pdf`,format:'A4',preferCSSPageSize:true});
    await expect(page.locator('.quantity')).toContainText('NGO: 1');
    const noScript=await browser.newContext({baseURL:'http://127.0.0.1:4183',javaScriptEnabled:false,viewport:{width:320,height:740}});
    try {
        const nativePage=await noScript.newPage();await blockExternal(nativePage);await login(nativePage,'donor',project);
        await expect(nativePage.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
        await expect(nativePage.locator('.mobile-create')).toBeVisible();await nativePage.locator('.mobile-create').click();
        await expect(nativePage).toHaveURL(/\/donate$/);expect(await nativePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    } finally {await noScript.close();}
});
