import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { io } from 'socket.io-client';
import { fileURLToPath } from 'node:url';

const delay = ms => new Promise(r => setTimeout(r, ms));
// Run with GAME_TABLE_TEST_PYTHON pointing to a Python with uvicorn and game-table dependencies.
const python = process.env.GAME_TABLE_TEST_PYTHON ?? 'python3';
const probe = net.createServer();
await new Promise(r => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise(r => probe.close(r));
const server = spawn(python, [fileURLToPath(new URL('../../backend/tests/fixtures/live_queue_server.py', import.meta.url)), String(port)], {stdio:['ignore','pipe','pipe']});
let serverErrors = '';
server.stderr.on('data', data => { serverErrors += data; });
const url = `http://127.0.0.1:${port}`;
for (let i=0; i<100; i++) {
    try { await fetch(url); break; } catch { await delay(20); }
}
let seq = 0;
const clients = [];
function connect(client) {
    return new Promise((resolve,reject) => {
        client.socket.once('connect',resolve);
        client.socket.once('connect_error',reject);
        client.socket.connect();
    });
}
async function client(name) {
    const socket = io(url,{autoConnect:false,transports:['polling'],auth:{client_session_id:`test-${seq++}`},reconnection:false});
    const c = {name,socket,view:null,id:null,restores:0}; clients.push(c);
    socket.on('table:updated',view=>{c.view=view;});
    socket.on('table:restored',response=>{c.view=response.table;c.id=response.member_id;c.restores++;});
    await connect(c); return c;
}
function call(c,event,data={}) {
    return new Promise((resolve,reject)=> c.socket.timeout(4000).emit(event,data,(err,result)=>err?reject(err):resolve(result)));
}
async function ok(c,event,data) {
    const result=await call(c,event,data);assert.ok(!result.error, `${event}: ${JSON.stringify(result)}`);return result;
}
async function until(predicate) {
    for(let i=0;i<200;i++){if(predicate())return;await delay(10);} throw Error('State did not converge');
}
async function table(code,names=['a','b','c','d','x','y','z','viewer']) {
    const people=await Promise.all(names.map(client));
    people[0].id=(await ok(people[0],'table:create',{table_code:code,name:names[0]})).member_id;
    for (const c of people.slice(1)) c.id=(await ok(c,'table:join',{table_code:code,name:c.name})).member_id;
    for (let i=0;i<4;i++) await ok(people[i],'table:assign_seat',{seat_index:i});
    await ok(people[0],'table:start_game');
    return people;
}
async function converge(people,phase) {
    await until(()=>people.filter(c=>c.socket.connected).every(c=>c.view?.post_game_transition?.phase===phase
        && JSON.stringify(c.view)===JSON.stringify(people[0].view)));
    const reference=JSON.stringify(people[0].view);
    assert.ok(people.filter(c=>c.socket.connected).every(c=>JSON.stringify(c.view)===reference),'All connected clients must agree');
}
async function response(c,value) {
    return ok(c,'table:post_game_keep_playing',{transition_id:c.view.post_game_transition.id,keep_playing:value});
}
async function winners(p,mix=false) {
    await converge(p,"winner_checks");
    await Promise.all([response(p[0],true),response(p[2],true)]);
    await Promise.all([0,2].map(i=>ok(p[i],'table:post_game_team_choice',{transition_id:p[i].view.post_game_transition.id,team_preference:mix&&i===2?'mix_it_up':'same_team'})));
}
async function cleanup(p){for(const c of p)c.socket.disconnect();}
try {
 await test('eight real clients: simultaneous choices, blocked seats, FIFO offers and shared seating', async()=>{
    const p=await table('LIVE-1');
    for(const c of p.slice(4,7))await ok(c,'table:queue_join');
    assert.deepEqual(p[0].view.queue,p.slice(4,7).map(c=>c.id));
    await ok(p[0],'table:end_game'); await converge(p,'winner_checks');
    assert.deepEqual(p[0].view.seats,[null,null,null,null]);
    assert.equal((await call(p[7],'table:assign_seat',{seat_index:0})).error,'ValueError');
    await winners(p,true);await converge(p,'challenger_checks');
    assert.equal(p[6].view.post_game_transition.players[p[6].id].decision,'waiting');
    await Promise.all([response(p[4],true),response(p[5],true)]);await converge(p,'seating_ready');
    const seats=p[0].view.seats;
    assert.equal(new Set(seats).size,4);
    assert.equal(seats.indexOf(p[0].id)%2!==seats.indexOf(p[2].id)%2,true);
    assert.deepEqual(p[0].view.queue,[p[6].id]);
    await cleanup(p);
 });
 await test('reconnect restores the same active prompt, queue order and identity',async()=>{
    const p=await table('LIVE-2');
    await ok(p[4],'table:queue_join');await ok(p[0],'table:end_game');
    await response(p[0],true);const id=p[0].id;const offer=p[0].view.post_game_transition.id;
    p[0].socket.disconnect();await connect(p[0]);
    await until(()=>p[0].restores===1&&p[0].view?.post_game_transition?.id===offer&&p[0].socket.connected);
    assert.equal(p[0].id,id);
    assert.equal(p[0].view.post_game_transition.players[id].decision,'team_choice');
    assert.deepEqual(p[0].view.queue,[p[4].id]);
    await ok(p[0],'table:post_game_team_choice',{transition_id:offer,team_preference:'same_team'});
    await response(p[2],false);await converge(p,'challenger_checks');await cleanup(p);
 });
 await test('lone challenger invites a loser; decline yields another selection',async()=>{
    const p=await table('LIVE-3');await ok(p[4],'table:queue_join');await ok(p[0],'table:end_game');
    await winners(p);await response(p[4],true);await converge(p,'partner_selection');
    const offer=p[0].view.post_game_transition.id;
    await ok(p[4],'table:post_game_player_choice',{transition_id:offer,selected_player:p[1].id});
    await response(p[1],false);await converge(p,'loser_checks');
    assert.deepEqual(p[0].view.post_game_transition.selection_candidates,[]);
    assert.equal(p[0].view.post_game_transition.players[p[3].id].decision,'keep_playing');
    await response(p[3],true);await converge(p,'seating_ready');
    assert.deepEqual(new Set(p[0].view.seats),new Set([p[0].id,p[2].id,p[4].id,p[3].id]));
    assert.equal((await call(p[1],'table:post_game_keep_playing',{transition_id:offer,keep_playing:true})).error,'ValueError');
    await cleanup(p);
 });
 await test('explicit challenger departure promotes next client immediately',async()=>{
    const p=await table('LIVE-4');for(const c of p.slice(4,7))await ok(c,'table:queue_join');
    await ok(p[0],'table:end_game');await winners(p);
    await ok(p[4],'table:leave');
    await until(()=>p[6].view.post_game_transition.players[p[6].id].decision==='ready');
    assert.deepEqual(p[6].view.queue,[p[5].id,p[6].id]);await cleanup(p);
 });
 await test('silent clients time out; every remaining client sees the next offers',async()=>{
    const p=await table('LIVE-5');for(const c of p.slice(4,7))await ok(c,'table:queue_join');
    await ok(p[0],'table:end_game');await winners(p);
    await until(()=>p[0].view.post_game_transition.players[p[6].id].decision==='ready');
    assert.equal(p[0].view.post_game_transition.players[p[4].id].decision,'timed_out');
    assert.equal(p[0].view.post_game_transition.players[p[5].id].decision,'timed_out');
    await converge(p,'challenger_checks');await response(p[6],false);await converge(p,'loser_checks');
    await Promise.all([response(p[1],true),response(p[3],true)]);await converge(p,'seating_ready');await cleanup(p);
 });
 await test('challenger confirms alongside winners, cancels, selects randomly, and other loser joins next queue',async()=>{
    const p=await table('LIVE-SIMULTANEOUS');await ok(p[4],'table:queue_join');await ok(p[0],'table:end_game');
    await converge(p,'winner_checks');
    assert.equal(p[4].view.post_game_transition.players[p[4].id].decision,'ready');
    await response(p[4],true);await converge(p,'winner_checks');
    assert.equal(p[4].view.post_game_transition.players[p[4].id].decision,'accepted');
    await winners(p);await converge(p,'partner_selection');
    const offer=p[4].view.post_game_transition.id;
    const deadline=p[4].view.post_game_transition.players[p[4].id].deadline;
    await ok(p[4],'table:post_game_player_choice',{transition_id:offer,selected_player:'__cancel__'});
    await converge(p,'challenger_checks');
    assert.equal(p[4].view.post_game_transition.players[p[4].id].deadline,deadline);
    assert.deepEqual(p[4].view.queue,[p[4].id]);
    await response(p[4],true);await converge(p,'partner_selection');
    assert.equal(p[4].view.post_game_transition.players[p[4].id].deadline,deadline);
    await ok(p[4],'table:post_game_player_choice',{transition_id:offer,selected_player:'__random__'});
    await converge(p,'loser_checks');
    const chosenId=Object.keys(p[0].view.post_game_transition.invited_by)[0];
    const chosen=p.find(c=>c.id===chosenId);const other=p[[p[1].id,p[3].id].indexOf(chosenId)===0?3:1];
    assert.deepEqual(p[0].view.post_game_transition.selection_notifications,{});
    await response(chosen,true);await converge(p,'seating_ready');
    assert.deepEqual(p[0].view.post_game_transition.selection_notifications[other.id],{challenger:p[4].id,player:chosenId,random:true});
    await ok(other,'table:queue_join');
    await until(()=>p.every(c=>c.view.queue.includes(other.id)));
    await cleanup(p);
 });
 await test('departing loser removes the challenger selection prompt and directly offers the survivor',async()=>{
    const p=await table('LIVE-LOSER-LEAVE');await ok(p[4],'table:queue_join');await ok(p[0],'table:end_game');
    await converge(p,'winner_checks');
    await response(p[4],true);await winners(p);await converge(p,'partner_selection');
    await ok(p[1],'table:leave');p[1].socket.disconnect();await converge(p,'loser_checks');
    assert.equal(p[4].view.post_game_transition.players[p[4].id].decision,'accepted');
    assert.equal(p[3].view.post_game_transition.players[p[3].id].decision,'keep_playing');
    await response(p[3],true);await converge(p,'seating_ready');await cleanup(p);
 });
 await test('active-game end confirmation broadcasts to all; a no cancels and all yes closes',async()=>{
    const p=await table('LIVE-END-1');await ok(p[0],'fixture:set_running');
    const request=await ok(p[0],'table:end_game');assert.equal(request.ended,false);
    await until(()=>p.every(c=>c.view?.end_game_confirmation?.status==='pending'));
    let vote=p[0].view.end_game_confirmation.id;
    assert.deepEqual(Object.keys(p[0].view.end_game_confirmation.responses).sort(),p.slice(0,4).map(c=>c.id).sort());
    assert.equal((await call(p[4],'table:end_game_response',{confirmation_id:vote,yes:false})).error,'ValueError');
    await ok(p[1],'table:end_game_response',{confirmation_id:vote,yes:false});
    await until(()=>p.every(c=>c.view?.end_game_confirmation?.status==='cancelled'));
    assert.ok(p[0].view.active_game_id);
    await ok(p[0],'table:end_game');await until(()=>p.every(c=>c.view?.end_game_confirmation?.status==='pending'));
    vote=p[0].view.end_game_confirmation.id;
    await Promise.all(p.slice(0,4).map(c=>ok(c,'table:end_game_response',{confirmation_id:vote,yes:true})));
    await converge(p,'loser_checks');assert.equal(p[0].view.active_game_id,null);await cleanup(p);
 });
 await test('unanswered active-game confirmation expires to yes for every client',async()=>{
    const p=await table('LIVE-END-2');await ok(p[0],'fixture:set_running');await ok(p[0],'table:end_game');
    await until(()=>p.every(c=>c.view?.end_game_confirmation?.status==='pending'));
    await until(()=>p.every(c=>c.view?.end_game_confirmation?.status==='approved'));
    await converge(p,'loser_checks');assert.equal(p[0].view.active_game_id,null);await cleanup(p);
 });
} finally {
 for(const c of clients)c.socket.disconnect();
 server.kill('SIGKILL');
 if(server.exitCode===null && server.signalCode===null) await new Promise(resolve=>server.once('exit',resolve));
 if(serverErrors.includes('Traceback'))throw Error(serverErrors);
}
