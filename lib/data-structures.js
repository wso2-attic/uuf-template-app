/**
 * Content holder
 * @param provider {UIComponent} holds content provided by this UI Component
 * @constructor
 */
function ContentHolder(provider) {
    this.provider = provider;
    /** @type {boolean} */
    this.isOverridden = false;
    /** @type {string[]} */
    this.contents = [];
}

/**
 *
 * @memberOf ContentHolder
 * @param isOverridden {boolean}
 * @param content {string}
 * @return {boolean}
 */
ContentHolder.prototype.addContent = function (isOverridden, content) {
    if (this.isOverridden) {
        return false;
    }
    this.isOverridden = isOverridden;
    this.contents.push(content.trim());
    return true;
};

/**
 *
 * @memberOf ContentHolder
 * @param isOverridden {boolean}
 * @param content {string}
 */
ContentHolder.prototype.addContentForcefully = function (isOverridden, content) {
    this.isOverridden = isOverridden;
    this.contents.push(content.trim());
};

/**
 * @memberOf ContentHolder
 * @returns {boolean}
 */
ContentHolder.prototype.canAddContent = function () {
    return !this.isOverridden;
};

/**
 * Zone
 * @param name {string}
 * @constructor
 */
function Zone(name) {
    this.name = name;
    /** @type {Object.<string, ContentHolder>} */
    this.contents = {};
    /** @type {Object.<string, Zone>} */
    this.subZones = null;
    /** @type {Object.<string, string[]>} */
    this.resources = null;
}

/**
 *
 * @memberOf Zone
 * @param provider {UIComponent}
 * @return {boolean}
 */
Zone.prototype.addContentProvider = function (provider) {
    var contents = this.contents;
    var providerFullName = provider.fullName;
    var contentHolder = contents[providerFullName];
    if (contentHolder) {
        // Specified content provider already exists in this zone.
        return false;
    } else {
        contentHolder = new ContentHolder(provider);
        contents[providerFullName] = contentHolder;
        return true;
    }
};

/**
 *
 * @memberOf Zone
 * @return {UIComponent[]}
 */
Zone.prototype.getContentProviders = function () {
    var contents = this.contents;
    var rv = [];
    for (var providerFullName in contents) {
        if (contents.hasOwnProperty(providerFullName)) {
            rv.push(contents[providerFullName].provider);
        }
    }
    return rv;
};

/**
 *
 * @memberOf Zone
 * @param provider {UIComponent}
 * @param isOverridden {boolean}
 * @param content {string}
 * @return {boolean}
 */
Zone.prototype.addContent = function (provider, isOverridden, content) {
    return this.contents[provider.fullName].addContent(isOverridden, content);
};

/**
 *
 * @memberOf Zone
 * @param provider {UIComponent}
 * @param isOverridden {boolean}
 * @param content {string}
 */
Zone.prototype.addContentForcefully = function (provider, isOverridden, content) {
    this.contents[provider.fullName].addContentForcefully(isOverridden, content);
};

/**
 *
 * @memberOf Zone
 * @param provider {UIComponent}
 * @return {boolean}
 */
Zone.prototype.canAddContent = function (provider) {
    return this.contents[provider.fullName].canAddContent();
};

/**
 *
 * @memberOf Zone
 * @param providerFullName {string}
 * @param index {number}
 * @return {?string}
 */
Zone.prototype.getContent = function (providerFullName, index) {
    var contents = this.contents;
    var contentHolder = contents[providerFullName];
    if (contentHolder) {
        return contentHolder.contents[index];
    }
    return null;
};

/**
 *
 * @memberOf Zone
 * @param providerFullName {string}
 * @return {?string[]}
 */
Zone.prototype.getContents = function (providerFullName) {
    var contents = this.contents;
    var contentHolder = contents[providerFullName];
    if (contentHolder) {
        return contentHolder.contents;
    }
    return null;
};

/**
 *
 * @memberOf Zone
 * @param subZone {Zone}
 */
Zone.prototype.addSubZone = function (subZone) {
    var subZones = this.subZones;
    if (subZones) {
        subZones[subZone.name] = subZone;
    } else {
        subZones = {};
        subZones[subZone.name] = subZone;
        this.subZones = subZones;
    }
};

/**
 *
 * @memberOf Zone
 * @param subZoneName {string}
 * @return {?Zone}
 */
Zone.prototype.getSubZone = function (subZoneName) {
    var subZones = this.subZones;
    if (subZones) {
        return subZones[subZoneName];
    }
    return null;
};

/**
 *
 * @memberOf Zone
 * @return {boolean}
 */
Zone.prototype.hasSubZones = function () {
    return (this.subZones) ? true : false;
};

/**
 *
 * @memberOf Zone
 * @param type {string} type of the resource
 * @param path {string} relative path of the resource
 * @returns {boolean}
 */
Zone.prototype.addResource = function (type, path) {
    var resources = this.resources;
    if (resources) {
        var resourcesOfType = resources[type];
        if (resourcesOfType) {
            if (resourcesOfType.indexOf(path) != -1) {
                // 'path' already exists
                return false;
            }
            resourcesOfType.push(path);
        } else {
            resources[type] = [path];
        }
    } else {
        resources = {};
        resources[type] = [path];
        this.resources = resources;
    }
    return true;
};

/**
 *
 * @memberOf Zone
 * @param type {string} resource type
 * @returns {?string[]}
 */
Zone.prototype.getResources = function (type) {
    var resources = this.resources;
    if (resources) {
        return resources[type];
    } else {
        return null;
    }
};

/**
 *
 * @memberOf Zone
 * @returns {boolean}
 */
Zone.prototype.hasResources = function () {
    return (this.resources)? true: false;
};

/**
 * Zone tree
 * @constructor
 */
function ZoneTree() {
    /** @type {Object.<string, Zone>} */
    this.topLevelZones = {};
}

/**
 *
 * @memberOf ZoneTree
 * @param zone {Zone}
 */
ZoneTree.prototype.addTopLevelZone = function (zone) {
    this.topLevelZones[zone.name] = zone;
};

/**
 *
 * @memberOf ZoneTree
 * @param zoneName {string}
 * @return {Zone}
 */
ZoneTree.prototype.getTopLevelZone = function (zoneName) {
    return this.topLevelZones[zoneName];
};
