const net = require('net');
const crypto = require('crypto');
const nvss = require('../conf/nvs.json');
const _ = require('underscore');
const logger = require('./log').logger;
const http = require('http');

/*
 * 和netvista cloudserver的 web api 接口（默认3012端口）通信
 */

function md5(str)
{
	var hash = crypto.createHash('md5');
	hash.update(str);
	return hash.digest('hex').toUpperCase();
}

var conns = {};


function doRequest(path, cb, scope, para, method)
{
	var self = this;
	if(method=='GET'){
		var p = path + '?';
		for(var k in para){
			p += k + '=' + para[k] + '&';
		}
	}else{
		var p = path;
	}
	req = http.request({
		host: this.host,
		port: this.webport,
		method: method,
		path: '/'+p,
		headers: {
			'Cookie': 'nts-session-id='+this.sid,
			'Content-Type': 'application/json'
		}
	},function(res){
		var data;
		res.on('data', function(chunk){
			if(!data) data = chunk;
			else data = Buffer.concat([data,chunk]);
		});
		res.on('end', function(){
			if(!data) data = '';
			else data = data.toString();
			try{
				var r = JSON.parse(data);
				if(r.errorCode == 10 && path != 'login'){
					// 登录
					logger.debug('need login:', r);
					logger.debug(Object.keys(res));
					logger.debug(res.headers);
					var sid = self.sid;
					var authCode = md5(sid+'-'+md5('nts-'+self.password));
					self.doRequest('login', function(r){
						if(r.errorCode==0){
							// 成功登录，再次请求
							logger.info('login ok:',r.sessionId);
							self.sid = r.sessionId;
							self.doRequest(path, cb, scope, para, method);
						}else{
							logger.error('login fail:',r);
							cb.call(scope, r);
						}
					}, scope, {
						username: self.username,
						sessionId: sid,
						authCode: authCode,
						verifyCode: '',
						verifySMSVerifyCode: ''
					}, 'POST');
				}else{
					cb.call(scope, r);
//					logger.debug('succ:', r);
				}
			}catch(e){
				logger.error(e);
				cb.call(scope, {errorCode:3});
			}			
		});
		res.on('error', function(err){
			logger.error(err);
			cb.call(scope, {errorCode:3});
		});
	});
	req.on('error', function(err){
		logger.error(err);
		cb.call(scope, {errorCode:3});
	});
	if('GET' == method){
		req.end();
	}else{
		req.end(JSON.stringify(para));
	}
//	req.end(JSON.stringify(para));
//	req.end();
}

var api_get_maps = {
	getGroupList: 'getGroupList',
	getTestAlertList: 'getTestAlertList',
	getTestAlertLogList: 'getTestAlertLogList',
	getTestResultList: 'getDataDetails',
	getTopologyDetails: 'getTopologyNodeList'
}
function attachAPI(conn)
{
	conn.doRequest = doRequest;
//	conn.getTestAlertList = getTestAlertList;
//	conn.getTestAlertLogList = getTestAlertLogList;
//	conn.getTestResultList = getTestResultList;
//	conn.getTopologyDetails = getTopologyDetails;
	_.each(api_get_maps, function(v,k){
		conn[k] = function(cb, scope, para){
			this.doRequest(v, cb, scope, para, 'GET');
		}
	});
}

function getConn(name, cb, scope)
{
	if(!cb) return;
	var conn = conns[name];
	if(!conn){
		var nvs = nvss[name];
 		if(!nvs || !nvs.webport || !nvs.host){
			cb.call(scope, false);
			return;
		}
		conn = nvs;
		conn.sid = Math.round(Math.random() * 100000000)
		attachAPI(conn);
		conns[name] = conn;
	}
	cb.call(scope, conn);
}

module.exports = {
	getConn: getConn
}

