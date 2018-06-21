"use strict";

const fs = require("fs");

module.exports.toplevel = function toplevel(filename, metadata) {
    let stats = fs.statSync(filename);
    return {
        offset: 0,
        length: stats.size,
        metadata: metadata,
    };
};

module.exports.open = function open(filename, offset, length) {
    return fs.createReadStream(filename, {
        start: offset,
        end: offset + length - 1,
    });
};
