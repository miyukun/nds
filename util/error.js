
var ErrDef= {
  UNKNOWN: 'unknown',
  SUCCESS: 0,
  ACCESS_DENIED: 1,
  INVALID_PARAMETERS: 2,
  INTERNAL_ERROR: 3,
  DESTINATION_UNREACHABLE: 4,
  SERVICE_BUSY: 5,
  NETWORK_UNREACHABLE: 6,
  ALREADY_EXISTS: 7,
  NO_SUCH_TEST_SCRIPT: 8,
  NO_SUCH_TEST: 9,
  NO_SUCH_SESSION: 10,
  NO_SUCH_ITEM: 11,
  NETWORK_ERROR: 12,
  TIMEOUT: 13,
  NOT_READY: 14,
  CANCELED: 15,
  THRESHOLD_EXCEED: 16,
  AUTH_FAILED: 17,
  NO_PRIVILEGES: 18,
  ALREADY_LOGIN: 19,
  DESTINATION_OPFFLINE: 20,
  NOT_SUPPORTED: 21,
  PASSWORD_EXPIRED: 22,
  LICENSE_INVALID: 23,
  LICENSE_EXCEED: 24,
  LICENSE_EXPIRED: 25,
  INVALID_FILE_FORMAT: 26,
  PACKAGE_ALREADY_EXISTS: 27,
  UNEXCEPT_FORMULA: 28,
  INVALID_VERIFY_CODE: 29,
  INVALID_OLD_PWD: 30,

  INVALID_MSM_CODE: 31,
  PHONE_NUMBER_EMPTY: 32,
  PHONE_NEED_BIND: 33,

  DIAG_ACCOUNT_NOT_EXIST: 1205,
  VERIFICATION_FAILED:1206
}

var ErrMsg = {
      0:  '操作成功',
      1:  '访问被拒绝',
      2:  '无效的输入参数',
      3:  '系统内部错误',
      4:  '目标不可用',
      5:  '服务繁忙',
      6:  '网络不可用',
      7:  '对应的内容已经存在',
      8:  '对应的测试脚本不存在',
      9:  '对应的测试项不存在',
      10: '会话不存在或者由于超时已经被注销，请重新登录',
      11: '对应的项不存在',
      12: '网络错误',
      13: '操作超时',
      14: '对应内容没有准备就绪',
      15: '已经取消',
      16: '超出门限值',
      17: '验证错误，用户名不存在或者密码错误',
      18: '没有对应的权限',
      19: '用户已经登录,同一用户不允许重复登录',
      20: '由于目标不在线,无法提供指定的服务',
      21: '不支持指定的操作',
      22: '密码已经过期，需要修改密码才能继续',
      23: '无效的服务器授权',
      24: '已超过服务器授权限制',
      25: '服务器授权已经到期',
      26: '无效的文件格式',
      27: '软件包已经存在',
      28: '非预期的计算公式',
      29: '无效的验证码',
      30: '旧密码无效',

      40: '您的账号已被锁定，请联系管理员解锁',
      1025: '帐号不存在',
      1206:'验证码不正确',

      unknown: '未知的网络错误',
      undefined:'未被定义'
};

module.exports = {};
for(var k in ErrDef){
  var v = ErrDef[k];
  module.exports[k] = {
    errorCode:v,
    errorMsg:ErrMsg[v]
  }
}

module.exports  = function (k) {
    var v = ErrDef[k];

    return Object.assign({
        errorCode:v,
        errorMsg:ErrMsg[v]
    });
};
//
//
// module.exports= {
//   "SUCCESS":{
//     "errCode":"0",
//     "err":"操作成功"
//   },
//   "FAIL":{
//     "errCode":"1",
//     "err":"failed"
//   },
//   "NOLOGIN":{
//     "errCode":"2",
//     "err":"没有登录"
//   },
//   "ILLEGALREQUEST":{
//     "errCode":"3",
//     "err":"非法的请求，请先登录"
//   },
//   "ERRORLOGIN":{
//     "errCode":"4",
//     "err":"用户名或密码不对"
//   },
//   "ERRORNAME":{
//     "errCode":"6",
//     "err":"用户名不对"
//   },
//   "SESSIONEXPIRE":{
//     "errCode":"5",
//     "err":"会话过期，已经重置会话，请登录"
//   },
//   "MISSINGINFO":{
//     "errCode":"7",
//     "err":"缺少必要的信息"
//   },
//   getError:function(errName){
//     errName = errName.toUpperCase();
//     if(this[errName]){
//       return this[errName];
//     }else{
//       return {
//         "errCode":"100",
//         "err":"unknow error"
//       };
//     }
//   }
// };