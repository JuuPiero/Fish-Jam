'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getString = getString;
exports.getFloat = getFloat;
exports.getInt = getInt;
exports.getBool = getBool;
exports.getObj = getObj;
exports.getArr = getArr;
exports.getVec3 = getVec3;
exports.getQuat = getQuat;
exports.getColor = getColor;
exports.isModuleEnabled = isModuleEnabled;
/** Safely get a string value from a JSON object */
function getString(obj, key, fallback = '') {
    const val = obj[key];
    return typeof val === 'string' ? val : fallback;
}
/** Safely get a number value from a JSON object */
function getFloat(obj, key, fallback = 0) {
    const val = obj[key];
    return typeof val === 'number' ? val : fallback;
}
/** Safely get an integer value from a JSON object */
function getInt(obj, key, fallback = 0) {
    const val = obj[key];
    return typeof val === 'number' ? Math.round(val) : fallback;
}
/** Safely get a boolean value from a JSON object */
function getBool(obj, key, fallback = false) {
    const val = obj[key];
    return typeof val === 'boolean' ? val : fallback;
}
/** Safely get a nested object from a JSON object */
function getObj(obj, key) {
    const val = obj[key];
    return val && typeof val === 'object' && !Array.isArray(val) ? val : null;
}
/** Safely get an array from a JSON object */
function getArr(obj, key) {
    const val = obj[key];
    return Array.isArray(val) ? val : [];
}
/** Get a Vec3 from a JSON array [x,y,z] */
function getVec3(obj, key) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 3) {
        return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0 };
    }
    return { x: 0, y: 0, z: 0 };
}
/** Get a Quaternion from a JSON array [x,y,z,w] */
function getQuat(obj, key) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 4) {
        return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0, w: arr[3] || 1 };
    }
    return { x: 0, y: 0, z: 0, w: 1 };
}
/** Get a Color from a JSON array [r,g,b,a] (0-1 range) */
function getColor(obj, key) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 4) {
        return { r: arr[0] || 0, g: arr[1] || 0, b: arr[2] || 0, a: arr[3] || 1 };
    }
    return { r: 1, g: 1, b: 1, a: 1 };
}
/** Check if a module JSON has enabled: true */
function isModuleEnabled(obj) {
    return getBool(obj, 'enabled', false);
}
//# sourceMappingURL=json-helpers.js.map