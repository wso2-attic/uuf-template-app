function getApps() {
    var apps = {};
    apps['app-git'] = {name: "Facebook", icon: "fb-logo.jpg", url: "http://facebook.com"};
    apps['app-fb'] = {name: "Git", icon: "github-octocat.png", url: "http://github.com"};
    apps['app-gmail'] = {name: "Gmail", icon: "gmail-logo.jpg", url: "http://mail.google.com"};
    apps['app-google'] = {name: "Google", icon: "google-logo.png", url: "http://google.com"};
    apps['app-jaggery'] = {name: "Jaggery", icon: "jaggeryjs.png", url: "http://jaggeryjs.org"};
    apps['app-wso2'] = {name: "WSO2", icon: "wso2-logo.jpg", url: "http://wso2.com"};
    apps['app-default'] = {name: "App", icon: "default.png", url: "#"};
    return apps;
}

function onRequest(context) {
    var apps = getApps();
    var app = apps[request.getAllParameters().id];
    if (!app) {
        app = apps['app-default'];
    }
    app.id = request.getAllParameters().id;
    return app;
}