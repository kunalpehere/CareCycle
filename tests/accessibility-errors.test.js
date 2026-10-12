import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import path from 'node:path';
import { respondError } from '../src/middleware/errors.js';

test('interactive errors retain status and private caching while API errors keep their existing body',()=>{
    let status,rendered,sent;
    const headers={};const res={status(value){status=value;return this;},setHeader(key,value){headers[key]=value;},vary(key){headers.Vary=key;},render(view,data){rendered={view,data};},send(value){sent=value;}};
    respondError({accepts:()=> 'html'},res,403,'Invalid request token');
    assert.equal(status,403);assert.equal(rendered.view,'request-error.ejs');assert.equal(headers['Cache-Control'],'private, no-store');assert.equal(headers.Vary,'Cookie');
    respondError({accepts:()=> 'json'},res,429,'Too many requests');assert.equal(status,429);assert.equal(sent,'Too many requests');
});

test('request error templates provide landmarks and escape error details',async()=>{
    const html=await ejs.renderFile(path.resolve('views/request-error.ejs'),{status:400,message:'<script>synthetic</script>',csrfToken:'synthetic',currentUser:null});
    assert.match(html,/id="main-content"/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>synthetic'));
    assert.match(html,/Contact CareCycle/);
});
