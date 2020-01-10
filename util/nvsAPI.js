const net = require('net');
const crypto = require('crypto');
const nvss = require('../conf/nvs.json');
const _ = require('underscore');
const logger = require('./log').logger;

/*
 * 和netvista cloudserver的api接口（默认3016端口）通信
 *   告警/测试
 */

function md5(str)
{
	var hash = crypto.createHash('md5');
	hash.update(str);
	return hash.digest('hex').toUpperCase();
}

/*
 过程: 
   握手 -> hello -> register -> 
   
 stage：
 	0: 刚建立tcp连接
 	1: 收到http-WebSocket头
 	2: 成功登录，正常工作
 	3: 连接断开
 */


// 请求的头部，固定不变
const head = "GET /web-json-control HTTP/1.1\r\n\
Host: cloudserver\r\n\
Connection: Upgrade\r\n\
Upgrade: WebSocket\r\n\
Origin: http://netvista.vixtel.com\r\n\
Sec-WebSocket-Protocol: sample\r\n\
Sec-WebSocket-Key1: 12345678\r\n\
Sec-WebSocket-Key2: 12345678\r\n\
\r\n\
12345678";

const rspHead = 'HTTP/1.1 101 WebSocket Protocol Handshake';


// 请求的序列号的初始值
var sequence = 6666;

// 所有的请求, 键是sequence, 请求得到响应后会被删除
var reqs = {};

// 删掉过旧的req
function cleanReqs(){
	var now = new Date();
	_.each(reqs, function(v,k){
		if(now - v.time > 1000*600){
			// 删除超过10分钟的请求
			delete reqs[k];
		}
	});
}

// 创建数据包, 数据以0开头,以0xff结束
function mkBuf(obj)
{
	var bufObj = Buffer.from(JSON.stringify(obj), 'utf8');
	var bufSend = Buffer.allocUnsafe(bufObj.length+2);
	bufSend.writeUInt8(0);
	bufSend.writeUInt8(0xff, bufSend.length-1);
	bufObj.copy(bufSend,1,0);
	return bufSend;
}

// 创建请求
function mkReq(method, para, cb, scope)
{
	if(!para) para = {};
	var req = {
		msg:{
			request: true,
			method: method,
			sequence: ++sequence,
			parameter: para
		},
		time: new Date(),
		cb: cb,
		scope: scope
	};
	reqs[req.msg.sequence] = req;
	return req;
}

function sendReq(conn, method, para, cb, scope)
{
	if(!para) para = {};
	if(!para.sessionId && conn.sessionId){
		para.sessionId = conn.sessionId;
	}
	var req = mkReq(method, para, cb, scope);
	var buf = mkBuf(req.msg);
	conn.socket.write(buf);
	conn.sendTime = req.time;
}

function sendRsp(conn, req)
{
	var rsp = {
		request: false,
		method: req.method,
		sequence: req.sequence,
		result:{
			errorCode: 0
		}
	};
	var buf = mkBuf(rsp);
	conn.socket.write(buf);
	conn.sendTime = new Date();
}

// 处理接收到的消息
function processMsg(conn, msg){
	if(msg.request){
		// 请求
		switch(msg.method){
		case 'notifyTestResult':
			callback(conn, 'testResult', [msg.parameter]);
			break;
		case 'notifyTestAlert':
			callback(conn, 'testAlert', [msg.parameter]);
			break;
		case 'notifySystemAlert':
			callback(conn, 'systemAlert', [msg.parameter]);
			break;
		case 'notifyAgentEvent':
			callback(conn, 'agentEvent', [msg.parameter]);
			break;
		default:
			logger.info('req: '+msg.method, msg);
			break;
		}
		// 对所有的请求都发一个空的响应
		sendRsp(conn, msg);
	}else{
		// 响应
		var req = reqs[msg.sequence];
		if(!req || req.msg.method!=msg.method){
			callback(conn, 'error', ['rsp not match req',req,msg]);
			return;
		}
		var r = msg.result;
		if(r.errorCode != 0){
			logger.error(`rsp err: ${r.errorCode}`, req.msg, msg);
		}
		switch(req.msg.method){
		case 'hello':
			var rk = r.randomKey;
			if(conn.stage == 1){
				// 需要登录
				var nvs = conn.nvs;
				var ep = md5(`nts-${nvs.password}`);
				sendReq(conn, 'register', {
					username: nvs.username,
					authCode: md5(`${rk}-${ep}`)
				});
			}
			break;
		case 'register':
			if(r.errorCode == 0){
				// 登录成功
				logger.info('login succ: ', r.heartbeatInterval);
				conn.stage = 2;
				conn.sessionId = r.sessionId;
				conn.hbi = r.heartbeatInterval*1000;
				setTimeout(()=>{
					heartbeat(conn);
				},conn.hbi);
				callback(conn, 'connect', []);
			}else{
				// 登录失败
				callback(conn, 'error', ['login fail']);
				conn.socket.end();
			}
			break;
		case 'unregister':
			conn.socket.end();
			break;
		case 'heartbeat':
			logger.info('heartbeat');
			break;
		default:			
			if(req.cb){
				req.cb.call(req.scope, r);
			}else{
				logger.info('rsp:',msg);
			}
			break;
		}
	}
}


// 注册事件
// 支持的事件: error, end, connect, 
//  testResult, testAlert, systemAlert, agentEvent
function on(action, fn, scope, once=false){
	var cb = {
		fn: fn,
		scope: scope,
		once: once
	}
	if(this.listeners[action]){
		this.listeners[action].push(cb);
	}else{
		this.listeners[action] = [cb];
	}
}

function onOnce(action, fn, scope){
	this.on(action, fn, scope, true);
}

function callback(conn, action, paras){
	var cbs = conn.listeners[action];	
	if(cbs){
		_.each(cbs, function(cb){			
			if(cb.fn){
				var scope = cb.scope?cb.scope:conn;
				cb.fn.apply(scope, paras);
			}
		});
		cbs = _.filter(cbs, function(cb){
			return !cb.once;
		});
		conn.listeners[action] = cbs;
	}else{
		logger.info(action, paras);
	}
}

function heartbeat(conn){
	if(conn.stage != 2) return;
	cleanReqs();
//	var now = new Date();
//	if((now-conn.sendTime)>conn.hbi)
	{
		// 不论是否有数据,如果没有心跳,都会被断开的
		sendReq(conn, 'heartbeat', {});
	}
	setTimeout(()=>{
		heartbeat(conn);
	},conn.hbi);
}

// api 函数
function end(){
	if(this.stage == 2){
		sendReq(this, 'unregister', {});
	}else{
		if(this.socket) this.socket.end();
	}
}
// 查询测试
function getTrafficTestList(cb, scope, needGroups=true, needTests=true){
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getTrafficTestList', {
			needGroups: needGroups,
			needTests: needTests
		}, cb, scope);
	}
}
// 创建/修改常规测试任务
function updateTrafficTest(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'updateTrafficTest', para, cb, scope);
	}
}
// 创建临时测试任务
function createTempTest(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'createTempTest', para, cb, scope);
	}
}
// 删除测试任务
function deleteTest(cb, scope, testId){
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'deleteTest', {
			testId: testId
		}, cb, scope);
	}
}
// 开始测试任务
function startTestTask(cb, scope, testId){
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'startTestTask', {
			testId: testId
		}, cb, scope);
	}
}
// 停止测试任务
function stopTestTask(cb, scope, testId){
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'stopTestTask', {
			testId: testId
		}, cb, scope);
	}
}
// 查询测试结果
function getTestResultList(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getTestResultList', para, cb, scope);
	}
}
// 查询拓扑图
function getTopologyDetails(cb, scope, para){
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getTopologyDetails', para, cb, scope);
	}
}
// 查询测试告警列表
function getTestAlertList(cb, scope, start=0, limit=1000)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getTestAlertList', {
			start: start,
			limit: limit
		}, cb, scope);
	}
}
// 创建/修改测试告警配置
// 参数很多, 使用对象配置
function updateTestAlert(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'updateTestAlert', para, cb, scope);
	}
}
// 删除测试告警配置
function deleteTestAlert(cb, scope, alertId)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'deleteTestAlert', {
			alertId: alertId
		}, cb, scope);
	}
}
// 查询测试告警
function getTestAlertLogList(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getTestAlertLogList', para, cb, scope);
	}
}
// 查询探针设备列表
function getAgentList(cb, scope, onlineOnly=false, start=0, limit=100)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getAgentList', {
			onlineOnly: onlineOnly,
			start: start,
			limit: limit
		}, cb, scope);
	}
}
// 查询设备系统状态
function getSystemStatus(cb, scope, deviceId='')
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getSystemStatus', {
			deviceId: deviceId
		}, cb, scope);
	}
}
// 查询系统告警
function getSystemAlertList(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'getSystemAlertList', para, cb, scope);
	}
}
// 定制事件通知
function customEventNotify(cb, scope, para)
{
	if(this.stage!=2){
		if(cb) cb.call(scope, {errorCode:-1})
	}else{
		sendReq(this, 'customEventNotify', para, cb, scope);
	}
}

// 保存所有的连接
var conns = {};

// 获取连接, 外部不要直接调用下面的connect, 那样浪费连接
function getConn(name, cb, scope){	
	if(!cb) return;
	var conn = conns[name];
//	logger.info('getConn:', conns);
	if(conn){
		switch(conn.stage){
		case 0:
		case 1:
			conn.onOnce('connect', function(){
				cb.call(scope, conn);
				cb.called = true;
			});
			conn.onOnce('end', function(){
				if(!cb.called) cb.call(scope, false);
			});
			break;
		case 2:
			cb.call(scope, conn);
			break;
		default:
			conn.end();
			delete conns[name];
			conn = false;
			break;
		}
	}
	if(!conn){
		conn = connect(name);
		if(!conn){
			cb.call(scope, false);
			return;
		}
		conns[name] = conn;
		conn.onOnce('connect', function(){
			cb.call(scope, conn);
		});
		conn.onOnce('end', function(){
			cb.call(scope, false);
		});
	}
}

// 建立api连接
function connect(name){
	var nvs = nvss[name];
	if(!nvs){
		logger.error('no nvs: '+name);
		return false;
	}
	var socket = net.connect(nvs.port, nvs.host, ()=>{
		logger.info('socket conn');
		socket.write(head);
	});
	var conn = {
		nvs: nvs,
		socket: socket,
		listeners:{},
		stage: 0
	};
	
	conn.on = on;
	conn.onOnce = onOnce;
	conn.end = end;
	
	conn.getTrafficTestList = getTrafficTestList;
	conn.updateTrafficTest = updateTrafficTest;
	conn.createTempTest = createTempTest;
	conn.deleteTest = deleteTest;
	conn.startTestTask = startTestTask;
	conn.stopTestTask = stopTestTask;
	conn.getTestResultList = getTestResultList;
	
	conn.getTopologyDetails = getTopologyDetails;
	
	conn.getTestAlertList = getTestAlertList;
	conn.updateTestAlert = updateTestAlert;
	conn.deleteTestAlert = deleteTestAlert;
	conn.getTestAlertLogList = getTestAlertLogList;
	
	conn.getAgentList = getAgentList;
	conn.getSystemStatus = getSystemStatus;
	conn.getSystemAlertList = getSystemAlertList;
	
	conn.customEventNotify = customEventNotify;
	
	socket.on('data', (data)=>{
		if(conn.stage == 0){
			// 刚连接, 等待server的head
			var str = data.toString('utf8');
			var lines = str.split('\r\n');
			if(lines.length<=0 || lines[0]!=rspHead){
				callback(conn, 'error', ['Server return error Message']);
				socket.end();
				return;
			}
			// 已经确认收到header
			sendReq(conn, 'hello', {
				version: 'e2e'
			});
			conn.stage = 1;
			return;
		}
		// 数据以0开头,以0xff结尾
		if(conn.recvBuf){
			conn.recvBuf = Buffer.concat([conn.recvBuf, data]);
		}else{
			conn.recvBuf = data;
		}
		while(conn.recvBuf.length>0){
			var b = conn.recvBuf.indexOf(0);
			if(b<0){
				// 没有开头,这个buf没用,删掉
				conn.recvBuf = false;
				break;
			}
			var e = conn.recvBuf.indexOf(0xff, b)
			if(e<0){
				// 没有结尾,等待
				break;
			}
			// 取出一个包
			var buf = conn.recvBuf.slice(b+1,e);
			conn.recvBuf = conn.recvBuf.slice(e+1);
			// 包的内容应该是utf编码的json
			try{
				var str = buf.toString('utf8');
				var obj = JSON.parse(str);
				processMsg(conn, obj);
			}catch(e){
				callback(conn, 'error', [e]);
			}
		}
	});
	socket.on('end', ()=>{
		logger.info('socket end:', socket);
		conn.stage = 3;
		conn.socket = false;
		callback(conn, 'end', []);
	});
	socket.on('error', (e)=>{
		logger.error('socket error: ', e, socket);
		callback(conn, 'error', [e]);
		if(e.syscall == 'connect'){
			conn.stage = 3;
			conn.socket = false;
			callback(conn, 'end', []);
		}else{
			socket.end();
		}
	});
	return conn;
}

module.exports = {
	getConn: getConn
}


/*

错误码: 

编号	名称	描述
0	操作成功	标识一个接口调用操作成功，后续的结果描述将有效，对于非0的错误码，除非接口特殊说明，后续的结果描述将无效
1	访问被拒绝	由于当前登录的用户没有对应的操作权限而被拒绝
2	无效的输入参数	当参数标明为必须输入时，没有输入该参数或者该参数格式不对
3	系统内部错误	系统内部由于不可预料的原因导致出现了问题，需要联系管理员
4	目标不可用	当测试代理设备不可用或者目标设备信息无效时，例如：目标域名无法解析或者目标IP信息无效时
5	服务繁忙	服务器或者测试代理设备由于达到额定的性能约束，导致无法继续操作或者测试
6	网络不可用	服务器或者客户端的网络目前无法使用
7	对应的内容已经存在	重复增加一个有唯一约束的信息，例如：用户名重复
8	对应的测试脚本不存在	当测试代理的测试模块脚本不存在时，无法执行对应的测试项
9	对应的测试项不经存在	测试项不存在，无法继续操作
10	会话不存在	会话不存在或者由于超时已经被注销，请重新登录
11	对应的项不存在	对应的操作内容不存在，当指定ID/用户名查询相应的信息，而该条目不存在
12	网络错误	由于网络中断或者网络传输出现错误，无法继续进行
13	操作超时	在指定的时间内没有响应导致操作中断
14	对应内容没有准备就绪	当启动一个已经运行的测试，停止一个已经停滞的测试，无法继续执行时出现此错误
15	已经取消	操作被取消
16	超出门限值	测试结果超出了门限值范围
17	认证失败	验证失败，用户名不存在或者密码错误
18	没有对应的权限	由于当前登录的用户没有改模块操作的权限被禁止访问
19	重复登录	用户已经登录,同一用户不允许重复登录
20	目标不在线	由于目标不在线,无法提供指定的服务
21	操作不支持	不支持指定的操作
22	密码已经过期	密码已经过期，需要修改密码才能继续
23	无效的授权	授权信息无效或者被篡改导致验证失效
24	已超过授权限制	对应信息的数量已超过服务器授权限制
25	授权已到期	服务器授权时间已经到期，无法继续操作

*/

