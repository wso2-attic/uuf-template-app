
function onRequest(context) {
    var log = new Log("carbon");
    log.info(context.user);
    //log.info(require("process").getProperty('carbon.config.dir.path'));
    //var su = Packages.org.wso2.carbon.base.ServerConfiguration.getInstance().getFirstProperty("ServerURL");
    //log.info("ServerURL = " + su);
    //var process = require("process");
    //log.info("carbon.http.port = " + process.getProperty("carbon.http.port"));
    //log.info("carbon.https.port = " + process.getProperty("carbon.https.port"));
    //log.info("httpPort = " + process.getProperty("httpPort"));
    //log.info("httpsPort = " + process.getProperty("httpsPort"));
    //log.info("carbon.local.ip = " + process.getProperty("carbon.local.ip"));
    //
    //var carbon = require("carbon");
    //log.info("carbon.server.host = " + carbon.server.host);
    //log.info("carbon.server.httpPort = " + carbon.server.httpPort);
    //log.info("carbon.server.httpsPort = " + carbon.server.httpsPort);
    //log.info("carbon.server.ip = " + carbon.server.ip);
    //log.info("carbon.server.home = " + carbon.server.home);
    //return {a: "SAJITH"};
}